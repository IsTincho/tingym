import { db, getMeta, setMeta } from './db.js';
import { SEED_EXERCISES } from '../data/seedExercises.js';
import { newId, nowIso, exerciseSchema, routineSchema } from '@gym/shared';

// --- bootstrap -------------------------------------------------------------

// Hasta que exista auth (V1.1) el usuario local es un id generado offline.
// Cuando se agregue login, el server adopta este id o remapea una sola vez.
export async function getCurrentUserId() {
  let id = await getMeta('currentUserId');
  if (!id) {
    id = newId();
    await setMeta('currentUserId', id);
  }
  return id;
}

export async function bootstrap() {
  const ownerId = await getCurrentUserId();
  if (!(await getMeta('seededExercises'))) {
    const ts = nowIso();
    await db.exercises.bulkPut(
      SEED_EXERCISES.map((e) => ({
        _id: newId(),
        ownerId: null, // catalogo global
        ...e,
        createdAt: ts,
        updatedAt: ts,
      })),
    );
    await setMeta('seededExercises', true);
  }
  return { ownerId };
}

// --- ejercicios ------------------------------------------------------------

export function listExercises() {
  return db.exercises.orderBy('name').toArray();
}

export function getExercise(id) {
  return db.exercises.get(id);
}

export async function createExercise(input) {
  const ownerId = await getCurrentUserId();
  const ts = nowIso();
  const doc = exerciseSchema.parse({
    _id: newId(),
    ownerId,
    notes: '',
    ...input,
    createdAt: ts,
    updatedAt: ts,
  });
  await db.exercises.put(doc);
  return doc;
}

export async function updateExercise(id, patch) {
  const current = await db.exercises.get(id);
  if (!current) throw new Error('Ejercicio inexistente');
  const doc = exerciseSchema.parse({ ...current, ...patch, updatedAt: nowIso() });
  await db.exercises.put(doc);
  return doc;
}

export async function deleteExercise(id) {
  await db.exercises.delete(id);
}

// --- rutinas ---------------------------------------------------------------

export function listRoutines() {
  return db.routines.orderBy('updatedAt').reverse().toArray();
}

export function getRoutine(id) {
  return db.routines.get(id);
}

export async function createRoutine({ name }) {
  const ownerId = await getCurrentUserId();
  const ts = nowIso();
  const doc = routineSchema.parse({
    _id: newId(),
    ownerId,
    gymId: null,
    name,
    assignedTo: null,
    days: [],
    createdAt: ts,
    updatedAt: ts,
    syncState: 'local',
    clientUpdatedAt: ts,
  });
  await db.routines.put(doc);
  return doc;
}

// Toda escritura marca syncState 'local' y pisa clientUpdatedAt: es lo que
// el sync (M3) usa para last-write-wins.
export async function saveRoutine(routine) {
  const ts = nowIso();
  const doc = routineSchema.parse({
    ...routine,
    updatedAt: ts,
    clientUpdatedAt: ts,
    syncState: 'local',
  });
  await db.routines.put(doc);
  return doc;
}

export async function updateRoutine(id, mutate) {
  const current = await db.routines.get(id);
  if (!current) throw new Error('Rutina inexistente');
  const next = typeof mutate === 'function' ? mutate(structuredClone(current)) : { ...current, ...mutate };
  return saveRoutine(next);
}

export async function deleteRoutine(id) {
  await db.routines.delete(id);
}

// --- helpers de rutina (dias y slots) --------------------------------------

function nextDayKey(days) {
  let n = days.length + 1;
  const used = new Set(days.map((d) => d.key));
  while (used.has(`D${n}`)) n += 1;
  return `D${n}`;
}

export function addDay(routineId, label) {
  return updateRoutine(routineId, (r) => {
    r.days.push({ key: nextDayKey(r.days), label, slots: [] });
    return r;
  });
}

export function renameDay(routineId, dayKey, label) {
  return updateRoutine(routineId, (r) => {
    const day = r.days.find((d) => d.key === dayKey);
    if (day) day.label = label;
    return r;
  });
}

export function removeDay(routineId, dayKey) {
  return updateRoutine(routineId, (r) => {
    r.days = r.days.filter((d) => d.key !== dayKey);
    return r;
  });
}

export function addSlot(routineId, dayKey, slot) {
  return updateRoutine(routineId, (r) => {
    const day = r.days.find((d) => d.key === dayKey);
    if (!day) throw new Error('Día inexistente');
    day.slots.push({
      targetSets: 4,
      repRangeMin: 6,
      repRangeMax: 8,
      restSeconds: 120,
      note: '',
      ...slot,
    });
    return r;
  });
}

export function updateSlot(routineId, dayKey, index, patch) {
  return updateRoutine(routineId, (r) => {
    const day = r.days.find((d) => d.key === dayKey);
    if (!day || !day.slots[index]) throw new Error('Slot inexistente');
    day.slots[index] = { ...day.slots[index], ...patch };
    return r;
  });
}

export function removeSlot(routineId, dayKey, index) {
  return updateRoutine(routineId, (r) => {
    const day = r.days.find((d) => d.key === dayKey);
    if (day) day.slots.splice(index, 1);
    return r;
  });
}

// Reordenar mueve un slot una posicion: sin drag&drop, que en mano sudada falla.
export function moveSlot(routineId, dayKey, index, delta) {
  return updateRoutine(routineId, (r) => {
    const day = r.days.find((d) => d.key === dayKey);
    if (!day) return r;
    const to = index + delta;
    if (to < 0 || to >= day.slots.length) return r;
    const [item] = day.slots.splice(index, 1);
    day.slots.splice(to, 0, item);
    return r;
  });
}
