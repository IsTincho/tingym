/**
 * Carga la rutina de 4 días y el historial ya entrenado (18 al 24/08) en la
 * cuenta indicada, empujándolo por la misma API que usa la app.
 *
 * Se hace contra la API y no contra Mongo directo a propósito: así el seed
 * pasa por la misma validación y el mismo camino de sync que cualquier
 * dispositivo, y si algo del contrato está roto, se rompe acá.
 *
 * Uso:
 *   node worker/scripts/seed-rutina.js <API_URL> <EMAIL> <PASSWORD>
 */
import { pbkdf2Sync } from 'node:crypto';
import { SEED_EXERCISES, exerciseId, newId } from '@gym/shared';

const [API, EMAIL, PASSWORD] = process.argv.slice(2);
if (!API || !EMAIL || !PASSWORD) {
  console.error('Uso: node worker/scripts/seed-rutina.js <API_URL> <EMAIL> <PASSWORD>');
  process.exit(1);
}

// Mismos parametros que client/src/db/authKey.js: la contraseña no viaja, se
// manda PBKDF2 de la contraseña.
const authKey = pbkdf2Sync(
  PASSWORD,
  `tingym|${EMAIL.toLowerCase().trim()}`,
  210_000,
  32,
  'sha256',
).toString('hex');

const ex = exerciseId;
const iso = (fecha, hora = '19:00') => new Date(`2026-${fecha}T${hora}:00-03:00`).toISOString();

// --- la rutina ------------------------------------------------------------

const slot = (nombre, sets, min, max, rest, note = '') => ({
  exerciseId: ex(nombre),
  targetSets: sets,
  repRangeMin: min,
  repRangeMax: max,
  restSeconds: rest,
  note,
});

// Core: mismo bloque los días 1, 2 y 4, siempre al final.
const CORE = [
  slot('Plancha lateral', 3, 30, 45, 60, 'Por lado. Segundos, no reps'),
  slot('Plancha lateral con elevación de cadera', 3, 10, 12, 60, 'Por lado'),
  slot('Hollow hold', 3, 20, 30, 60, 'Segundos. Lumbar pegada al piso'),
  slot('Plancha con toque de hombros', 3, 16, 16, 60, 'Toques totales, cadera quieta'),
];

const DIAS = [
  {
    key: 'D1',
    label: 'Espalda + hombros (vertical)',
    slots: [
      slot('Jalón al pecho', 4, 6, 8, 150, 'O dominadas si entrás en el rango'),
      slot('Press militar sentado', 4, 6, 8, 150, 'Codo fijo, bajá lento'),
      slot('Remo en polea baja', 3, 10, 12, 90, 'O remo con mancuerna'),
      slot('Elevaciones laterales', 4, 12, 15, 60, 'Livianas y lentas. Si llegás a 8, el peso está mal'),
      slot('Pullover en polea', 3, 12, 12, 90),
      slot('Face pull', 3, 15, 15, 60, 'Codos altos'),
      ...CORE,
    ],
  },
  {
    key: 'D2',
    label: 'Brazos',
    slots: [
      slot('Curl con barra', 4, 8, 10, 120),
      slot('Curl inclinado con mancuernas', 3, 10, 12, 90),
      slot('Curl martillo', 3, 12, 12, 90),
      slot('Fondos', 4, 8, 10, 120, 'O press cerrado'),
      slot('Extensión sobre la cabeza', 3, 10, 12, 90, 'Codo quieto'),
      slot('Extensión en polea', 3, 12, 15, 60),
      ...CORE,
    ],
  },
  {
    key: 'D3',
    label: 'Piernas + pecho',
    slots: [
      // Pecho primero: arrancar con sentadillas deja el banco sin nada.
      slot('Press banca', 4, 6, 8, 180, 'Escápulas retraídas'),
      slot('Press inclinado con mancuernas', 3, 8, 10, 120),
      slot('Aperturas con mancuernas', 3, 12, 15, 60, 'O pec deck'),
      slot('Prensa', 4, 8, 10, 180, 'La sentadilla libre te limita por equilibrio'),
      slot('Hip thrust', 3, 8, 10, 120, 'Reemplaza al peso muerto rumano'),
      slot('Extensión de cuádriceps', 3, 12, 12, 90, 'O curl femoral'),
    ],
  },
  {
    key: 'D4',
    label: 'Espalda + hombros (horizontal)',
    slots: [
      slot('Remo en polea baja', 4, 8, 10, 150, 'O remo con barra'),
      slot('Jalón neutro', 4, 8, 10, 150, 'Asistida o polea hasta entrar en 8-10'),
      slot('Press militar sentado', 3, 8, 10, 120, 'Arnold descartado, incómodo'),
      slot('Elevaciones laterales', 4, 15, 20, 60),
      slot('Pájaros', 3, 15, 15, 60, 'Pecho apoyado, banco inclinado'),
      slot('Encogimientos', 3, 12, 12, 60),
      ...CORE,
    ],
  },
];

// --- el historial ya entrenado -------------------------------------------

const serie = (weightKg, reps, extra = {}) => ({
  weightKg,
  reps,
  rpe: null,
  failed: false,
  note: '',
  ...extra,
});

const reps = (n, weightKg, r, extra) => Array.from({ length: n }, () => serie(weightKg, r, extra));

// Cada entrada dice contra qué ejercicio de la rutina se entrenó y, cuando el
// día se cambió sobre la marcha, cuál reemplazó a cuál.
const SESIONES = [
  {
    dayKey: 'D1',
    fecha: '08-18',
    entries: [
      { nombre: 'Dominada supina', enLugarDe: 'Jalón al pecho', sets: reps(4, null, 5) },
      { nombre: 'Press militar sentado', sets: reps(4, 7.5, 10) },
      { nombre: 'Remo con mancuerna', enLugarDe: 'Remo en polea baja', sets: reps(4, 10, 10) },
      { nombre: 'Elevaciones laterales', sets: reps(3, 2.5, 15) },
      { nombre: 'Pullover en polea', sets: reps(4, 20, 12) },
      {
        nombre: 'Face pull',
        sets: reps(4, 20, 12, { note: 'peso de más, reps cortas' }),
      },
    ],
  },
  {
    dayKey: 'D2',
    fecha: '08-19',
    entries: [
      { nombre: 'Curl con barra', sets: reps(4, 20, 10) },
      { nombre: 'Curl inclinado con mancuernas', sets: reps(3, 5, 8) },
      { nombre: 'Curl martillo', sets: reps(3, 5, 12, { note: 'al límite' }) },
      { nombre: 'Fondos', sets: reps(4, null, 10) },
      { nombre: 'Extensión sobre la cabeza', sets: reps(3, 20, 12, { note: 'técnica controlada' }) },
      {
        nombre: 'Extensión en polea',
        sets: [serie(20, 10), serie(20, 12), serie(20, 12), serie(15, 15)],
      },
    ],
  },
  {
    dayKey: 'D3',
    fecha: '08-20',
    entries: [
      {
        nombre: 'Press banca en máquina',
        enLugarDe: 'Press banca',
        sets: reps(4, 30, 10, { note: 'contrapeso, 15 por lado' }),
      },
      { nombre: 'Press inclinado con mancuernas', sets: reps(3, 7.5, 12, { note: 'duras desde la 9' }) },
      { nombre: 'Aperturas con mancuernas', sets: reps(3, 5, 15) },
      {
        nombre: 'Sentadilla',
        enLugarDe: 'Prensa',
        sets: reps(4, 40, 10, { note: 'limita el equilibrio, no la fuerza' }),
      },
      { nombre: 'Extensión de cuádriceps', sets: reps(4, 25, 12) },
    ],
  },
  {
    dayKey: 'D4',
    fecha: '08-21',
    entries: [
      { nombre: 'Remo en polea baja', sets: reps(4, 40, 10) },
      {
        nombre: 'Dominada agarre neutro',
        enLugarDe: 'Jalón neutro',
        sets: [serie(null, 5, { note: 'difíciles' }), serie(null, 4), serie(null, 4), serie(null, 4)],
      },
      { nombre: 'Press militar sentado', sets: reps(3, 10, 8) },
      { nombre: 'Elevaciones laterales', sets: reps(4, 2.5, 20) },
      { nombre: 'Pájaros', sets: reps(3, 2.5, 15) },
      { nombre: 'Encogimientos', sets: reps(3, 10, 15) },
    ],
  },
  {
    dayKey: 'D1',
    fecha: '08-24',
    entries: [
      { nombre: 'Jalón al pecho', sets: reps(4, 40, 8, { note: 'costó' }) },
      { nombre: 'Press militar sentado', sets: reps(4, 12.5, 8, { note: 'con esfuerzo' }) },
      { nombre: 'Remo en polea baja', sets: reps(4, 40, 12) },
      {
        nombre: 'Elevaciones laterales',
        sets: [serie(5, 12), serie(5, 12), serie(5, 12), serie(5, 12, { note: 'la última costó' })],
      },
      { nombre: 'Pullover en polea', sets: reps(3, 25, 12) },
      { nombre: 'Face pull', sets: reps(3, 15, 20) },
    ],
  },
];

const PESAJES = [
  { fecha: '08-24', kg: 63.9, hora: '08:00' },
];

// --- armado y push --------------------------------------------------------

async function api(path, { method = 'POST', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`);
  return data;
}

const { token, user } = await api('/api/auth/login', {
  body: { email: EMAIL, authKey },
});

const ownerId = user._id;
const ahora = new Date().toISOString();

const routineId = newId();
const routine = {
  _id: routineId,
  ownerId,
  gymId: null,
  name: 'Rutina 4 días — espalda y hombros prioritarios',
  assignedTo: null,
  days: DIAS,
  createdAt: iso('08-18', '09:00'),
  updatedAt: ahora,
  syncState: 'local',
  clientUpdatedAt: ahora,
};

// Cada sesión guarda el objetivo del slot con el que se entrenó, para que el
// historial siga contando contra ese rango aunque la rutina cambie después.
const slotsPorDia = Object.fromEntries(DIAS.map((d) => [d.key, d.slots]));

const sessions = SESIONES.map((s) => {
  const fechaIso = iso(s.fecha);
  const slots = slotsPorDia[s.dayKey];
  return {
    _id: newId(),
    ownerId,
    routineId,
    dayKey: s.dayKey,
    date: fechaIso,
    status: 'done',
    entries: s.entries.map((e) => {
      const objetivoId = ex(e.enLugarDe ?? e.nombre);
      const desdeRutina = slots.find((x) => x.exerciseId === objetivoId);
      return {
        exerciseId: ex(e.nombre),
        substitutedFor: e.enLugarDe ? ex(e.enLugarDe) : null,
        target: desdeRutina
          ? {
              targetSets: desdeRutina.targetSets,
              repRangeMin: desdeRutina.repRangeMin,
              repRangeMax: desdeRutina.repRangeMax,
              restSeconds: desdeRutina.restSeconds,
              note: desdeRutina.note ?? '',
            }
          : null,
        sets: e.sets.map((x) => ({ ...x, loggedAt: fechaIso })),
        aiVerdict: null,
      };
    }),
    syncState: 'local',
    clientUpdatedAt: fechaIso,
  };
});

const bodyweight = PESAJES.map((p) => ({
  _id: newId(),
  ownerId,
  date: iso(p.fecha, p.hora),
  kg: p.kg,
  syncState: 'local',
  clientUpdatedAt: iso(p.fecha, p.hora),
}));

// El catalogo global tambien viaja: el cliente lo siembra solo, pero tenerlo
// en el servidor deja que la API resuelva nombres sin depender del telefono.
const exercises = SEED_EXERCISES.map((e) => ({
  ...e,
  createdAt: ahora,
  updatedAt: ahora,
}));

const resultado = await api('/api/sync', {
  token,
  body: { since: null, changes: { exercises, routines: [routine], sessions, bodyweight } },
});

console.log('Aplicado:', resultado.applied);
if (resultado.rejected.length > 0) {
  console.error('Rechazados:', JSON.stringify(resultado.rejected, null, 2));
  process.exit(1);
}
console.log(`Rutina "${routine.name}" con ${DIAS.length} días y ${sessions.length} sesiones.`);
