import { db } from './db.js';
import { getCurrentUserId, getRoutine } from './repo.js';
import {
  deterministicVerdict,
  newId,
  nowIso,
  sessionSchema,
  suggestedOpeningWeight,
} from '@gym/shared';

// El indice *exerciseIds vive denormalizado en el documento: se recalcula en
// cada guardado para que "ultima sesion de este ejercicio" sea una lectura
// por indice y no un scan de todas las sesiones.
function withIndex(session) {
  return {
    ...session,
    exerciseIds: [
      ...new Set(
        session.entries.flatMap((e) => [e.exerciseId, e.substitutedFor].filter(Boolean)),
      ),
    ],
  };
}

async function persist(session) {
  const ts = nowIso();
  // El indice no es parte del esquema compartido (es detalle del cliente),
  // asi que se valida el documento y recien despues se le agrega.
  const doc = sessionSchema.parse({
    ...session,
    exerciseIds: undefined,
    clientUpdatedAt: ts,
    syncState: 'local',
  });
  await db.sessions.put(withIndex(doc));
  return doc;
}

async function mutate(sessionId, fn) {
  const current = await db.sessions.get(sessionId);
  if (!current) throw new Error('Sesión inexistente');
  const next = fn(structuredClone(current));
  return persist(next);
}

// --- ciclo de vida --------------------------------------------------------

export async function getActiveSession() {
  const list = await db.sessions.where('status').equals('in_progress').toArray();
  // Si quedaron varias abiertas (cerraste la app a mitad, dos veces), la
  // ultima gana: es la que el usuario tiene en la cabeza.
  return list.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

export function getSession(id) {
  return db.sessions.get(id);
}

export async function startSession({ routineId = null, dayKey = null } = {}) {
  const ownerId = await getCurrentUserId();
  let entries = [];

  if (routineId && dayKey) {
    const routine = await getRoutine(routineId);
    const day = routine?.days.find((d) => d.key === dayKey);
    // El objetivo se copia al ejecutar: si mas adelante editas la rutina, el
    // historial sigue contando contra el rango que realmente entrenaste.
    entries = (day?.slots ?? []).map((slot) => ({
      exerciseId: slot.exerciseId,
      substitutedFor: null,
      // Se copian junto con el target y por la misma razon: la sesion en curso
      // no cambia si mañana editas la rutina. Y quedan disponibles sin red.
      alternativeIds: slot.alternativeIds ?? [],
      target: {
        targetSets: slot.targetSets,
        repRangeMin: slot.repRangeMin,
        repRangeMax: slot.repRangeMax,
        restSeconds: slot.restSeconds,
        note: slot.note ?? '',
      },
      sets: [],
      aiVerdict: null,
    }));
  }

  return persist({
    _id: newId(),
    ownerId,
    routineId,
    dayKey,
    date: nowIso(),
    status: 'in_progress',
    entries,
    syncState: 'local',
    clientUpdatedAt: nowIso(),
  });
}

export function finishSession(sessionId) {
  return mutate(sessionId, (s) => {
    // Las entradas sin una sola serie no se entrenaron: guardarlas ensucia
    // el historial y arruina el "ultima vez" del proximo dia.
    s.entries = s.entries.filter((e) => e.sets.some((x) => Number(x.reps) > 0));
    s.status = 'done';
    return s;
  });
}

export function discardSession(sessionId) {
  return db.sessions.delete(sessionId);
}

export function listSessions({ limit = 50 } = {}) {
  return db.sessions.orderBy('date').reverse().limit(limit).toArray();
}

export function listDoneSessions() {
  return db.sessions
    .orderBy('date')
    .reverse()
    .filter((s) => s.status === 'done')
    .toArray();
}

// --- series ---------------------------------------------------------------

export function logSet(sessionId, entryIndex, set) {
  return mutate(sessionId, (s) => {
    const entry = s.entries[entryIndex];
    if (!entry) throw new Error('Ejercicio inexistente en la sesión');
    entry.sets.push({
      weightKg: set.weightKg ?? null,
      reps: Number(set.reps) || 0,
      rpe: set.rpe ?? null,
      failed: Boolean(set.failed),
      note: set.note ?? '',
      loggedAt: nowIso(),
    });
    // El veredicto cacheado queda viejo apenas cambian las series.
    entry.aiVerdict = null;
    return s;
  });
}

export function updateSet(sessionId, entryIndex, setIndex, patch) {
  return mutate(sessionId, (s) => {
    const entry = s.entries[entryIndex];
    if (!entry?.sets[setIndex]) throw new Error('Serie inexistente');
    entry.sets[setIndex] = { ...entry.sets[setIndex], ...patch };
    entry.aiVerdict = null;
    return s;
  });
}

export function removeSet(sessionId, entryIndex, setIndex) {
  return mutate(sessionId, (s) => {
    s.entries[entryIndex]?.sets.splice(setIndex, 1);
    if (s.entries[entryIndex]) s.entries[entryIndex].aiVerdict = null;
    return s;
  });
}

export function addEntry(sessionId, exerciseId, target = null) {
  return mutate(sessionId, (s) => {
    s.entries.push({
      exerciseId,
      substitutedFor: null,
      target,
      // Un ejercicio suelto no viene de un slot, asi que no trae alternativas.
      alternativeIds: [],
      sets: [],
      aiVerdict: null,
    });
    return s;
  });
}

export function removeEntry(sessionId, entryIndex) {
  return mutate(sessionId, (s) => {
    s.entries.splice(entryIndex, 1);
    return s;
  });
}

// Cambiar el ejercicio del dia (no habia mancuernas de 4, la maquina estaba
// ocupada) sin romper el historial: queda registrado a quien reemplaza.
export function substituteEntry(sessionId, entryIndex, newExerciseId) {
  return mutate(sessionId, (s) => {
    const entry = s.entries[entryIndex];
    if (!entry) throw new Error('Ejercicio inexistente en la sesión');
    if (entry.exerciseId === newExerciseId) return s;
    entry.substitutedFor = entry.substitutedFor ?? entry.exerciseId;
    entry.exerciseId = newExerciseId;
    entry.aiVerdict = null;
    return s;
  });
}

export function saveVerdict(sessionId, entryIndex, verdict) {
  return mutate(sessionId, (s) => {
    if (s.entries[entryIndex]) s.entries[entryIndex].aiVerdict = verdict;
    return s;
  });
}

// --- historial por ejercicio ----------------------------------------------

/**
 * Sesiones terminadas en las que aparece el ejercicio, mas nuevas primero.
 * Lectura por indice multiEntry: no recorre todas las sesiones.
 */
export async function exerciseHistory(exerciseId, { limit = 10, excludeSessionId = null } = {}) {
  const found = await db.sessions.where('exerciseIds').equals(exerciseId).toArray();
  return found
    .filter((s) => s.status === 'done' && s._id !== excludeSessionId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((s) => {
      const entry = s.entries.find((e) => e.exerciseId === exerciseId);
      return {
        sessionId: s._id,
        date: s.date,
        sets: entry?.sets ?? [],
        target: entry?.target ?? null,
        aiVerdict: entry?.aiVerdict ?? null,
      };
    });
}

/** Lo que hace falta para el bloque "última vez" al lado del input (M4). */
export async function lastPerformance(exerciseId, { excludeSessionId = null } = {}) {
  const [last] = await exerciseHistory(exerciseId, { limit: 1, excludeSessionId });
  return last ?? null;
}

/**
 * Todo lo que la pantalla de un ejercicio necesita de una: la ultima vez, el
 * veredicto determinista de esa ultima vez y el peso con el que arrancar hoy.
 */
export async function exerciseBriefing(exerciseId, { target, loadType, excludeSessionId }) {
  const last = await lastPerformance(exerciseId, { excludeSessionId });
  if (!last) return { last: null, verdict: null, openingWeight: null };
  const effectiveTarget = target ?? last.target;
  return {
    last,
    verdict: deterministicVerdict({
      sets: last.sets,
      target: effectiveTarget,
      loadType,
    }),
    openingWeight: suggestedOpeningWeight({
      lastSets: last.sets,
      target: effectiveTarget,
      loadType,
    }),
  };
}
