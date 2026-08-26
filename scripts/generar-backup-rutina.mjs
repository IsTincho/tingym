// Convierte rutina-4-dias.md en un backup importable por la app.
//
// Se escribe a mano y no se parsea el markdown: la tabla de pesos es prosa
// ("polea 40 kg · 4x12 ✓ techo → subir a 45", "fondos en rack, peso corporal")
// y un parser que la entienda seria mas fragil y mas largo que transcribirla
// una vez. Esto corre una sola vez.
//
// Correr con: node scripts/generar-backup-rutina.mjs > mi-backup.json

import { randomUUID } from 'node:crypto';
import { exerciseId, routineSchema, sessionSchema, bodyweightEntrySchema } from '../shared/src/index.js';

const ex = exerciseId;
const uid = () => randomUUID();

// Las fechas del plan, en hora local del gimnasio (media tarde) para que
// caigan en el dia correcto sin importar el huso.
const dia = (d) => new Date(`2026-08-${d}T18:00:00.000Z`).toISOString();

// Descansos segun la regla escrita: 2-3 min en los pesados (6-8 reps),
// 60-90 seg en los livianos (12+).
const descanso = (max) => (max <= 8 ? 150 : max <= 12 ? 90 : 60);

const slot = (nombre, alternativas, sets, min, max, extra = {}) => ({
  exerciseId: ex(nombre),
  alternativeIds: alternativas.map(ex),
  targetSets: sets,
  repRangeMin: min,
  repRangeMax: max,
  restSeconds: descanso(max),
  perSide: false,
  note: '',
  ...extra,
});

// El core alterna pareja A y B en cada dia de core (D1, D2, D4). Se cargan las
// dos parejas como alternativas entre si, que es lo mas cerca que el modelo de
// hoy llega a expresarlo.
const CORE_A = [
  slot('Plancha lateral', ['Hollow hold'], 2, 30, 45, { perSide: true, restSeconds: 60 }),
  slot('Plancha con toque de hombros', ['Plancha lateral con elevación de cadera'], 2, 16, 16, {
    restSeconds: 60,
  }),
];

const DIAS = [
  {
    key: 'D1',
    label: 'Espalda + hombros (vertical)',
    slots: [
      slot('Dominadas', ['Jalón al pecho', 'Dominada supina'], 4, 6, 8),
      slot('Press militar sentado', ['Press militar con barra'], 4, 6, 8),
      slot('Remo con mancuerna', ['Remo en polea baja'], 3, 10, 12),
      slot('Elevaciones laterales', [], 4, 12, 15),
      slot('Pullover en polea', [], 3, 12, 12),
      slot('Face pull', [], 3, 15, 15),
      ...CORE_A,
    ],
  },
  {
    key: 'D2',
    label: 'Brazos',
    slots: [
      slot('Curl con barra', ['Curl con mancuernas'], 4, 8, 10),
      slot('Curl inclinado con mancuernas', [], 3, 10, 12),
      slot('Curl martillo', [], 3, 12, 12),
      slot('Press cerrado', ['Fondos'], 4, 8, 10),
      slot('Extensión sobre la cabeza', [], 3, 10, 12),
      slot('Extensión en polea', [], 3, 12, 15),
      ...CORE_A,
    ],
  },
  {
    key: 'D3',
    label: 'Piernas + pecho',
    slots: [
      // El pecho va primero: si arrancas con sentadillas llegas muerto al banco.
      slot('Press banca', ['Press banca en máquina'], 4, 6, 8),
      slot('Press inclinado con mancuernas', [], 3, 8, 10),
      slot('Aperturas con mancuernas', ['Pec deck'], 3, 12, 15),
      slot('Sentadilla', ['Prensa'], 4, 8, 10),
      // El plan ya dice reemplazarlo por hip thrust: va como alternativa.
      slot('Peso muerto rumano', ['Hip thrust'], 3, 8, 10),
      slot('Curl femoral', ['Extensión de cuádriceps'], 3, 12, 12),
    ],
  },
  {
    key: 'D4',
    label: 'Espalda + hombros (horizontal)',
    slots: [
      slot('Remo con barra', ['Remo en polea baja'], 4, 8, 10),
      slot('Jalón neutro', ['Dominada supina', 'Dominada agarre neutro'], 4, 8, 10),
      slot('Press militar sentado', ['Press Arnold'], 3, 8, 10),
      slot('Elevaciones laterales', [], 4, 15, 20),
      slot('Pájaros', ['Deltoide posterior en máquina'], 3, 15, 15),
      slot('Encogimientos', [], 3, 12, 12),
      ...CORE_A,
    ],
  },
];

const ahora = new Date().toISOString();
const rutina = {
  _id: uid(),
  ownerId: 'PENDIENTE',
  gymId: null,
  name: '4 días — espalda y hombros',
  assignedTo: null,
  days: DIAS,
  createdAt: dia('18'),
  updatedAt: ahora,
  syncState: 'local',
  clientUpdatedAt: ahora,
};

// --- historial ------------------------------------------------------------
//
// `s(peso, reps)` una serie; `rep(n, peso, reps)` n series iguales, que es como
// esta anotado casi todo ("4x10"). Peso null = peso corporal.

const set = (fecha, weightKg, reps, note = '') => ({
  weightKg,
  reps,
  rpe: null,
  failed: false,
  warmup: false,
  note,
  loggedAt: fecha,
});
const rep = (fecha, n, w, r, note = '') =>
  Array.from({ length: n }, () => set(fecha, w, r, note));

const entrada = (nombre, sets, target, sustituyeA = null) => ({
  exerciseId: ex(nombre),
  substitutedFor: sustituyeA ? ex(sustituyeA) : null,
  target,
  alternativeIds: [],
  sets,
  aiVerdict: null,
});

const t = (sets, min, max) => ({
  targetSets: sets,
  repRangeMin: min,
  repRangeMax: max,
  restSeconds: descanso(max),
  perSide: false,
  note: '',
});

const SESIONES = [
  {
    fecha: dia('18'),
    dayKey: 'D1',
    entradas: (f) => [
      entrada('Dominada supina', rep(f, 4, null, 5), t(4, 6, 8), 'Dominadas'),
      entrada('Press militar sentado', rep(f, 4, 7.5, 10), t(4, 6, 8)),
      entrada('Remo con mancuerna', rep(f, 4, 10, 10), t(3, 10, 12)),
      entrada('Elevaciones laterales', [set(f, 2.5, 15)], t(4, 12, 15)),
      entrada('Pullover en polea', rep(f, 4, 20, 12), t(3, 12, 12)),
      entrada('Face pull', rep(f, 4, 20, 12, 'peso de más, reps cortas'), t(3, 15, 15)),
    ],
  },
  {
    fecha: dia('19'),
    dayKey: 'D2',
    entradas: (f) => [
      entrada('Curl con barra', [set(f, 20, 10, 'barra sola')], t(4, 8, 10)),
      entrada('Curl inclinado con mancuernas', [set(f, 5, 8)], t(3, 10, 12)),
      entrada('Curl martillo', [set(f, 5, 12, 'al límite')], t(3, 12, 12)),
      entrada('Fondos', [set(f, null, 10, 'en banco, pies en el piso')], t(4, 8, 10), 'Press cerrado'),
      entrada('Extensión sobre la cabeza', [set(f, 20, 12, 'técnica controlada')], t(3, 10, 12)),
      entrada('Extensión en polea', [set(f, 20, 10), set(f, 20, 12), set(f, 20, 12), set(f, 15, 15)], t(3, 12, 15)),
    ],
  },
  {
    fecha: dia('20'),
    dayKey: 'D3',
    entradas: (f) => [
      entrada('Press banca en máquina', [set(f, 30, 10, '15 kg por lado, con contrapeso')], t(4, 6, 8), 'Press banca'),
      entrada('Press inclinado con mancuernas', [set(f, 7.5, 12, 'duras desde la 9')], t(3, 8, 10)),
      entrada('Aperturas con mancuernas', [set(f, 5, 15)], t(3, 12, 15)),
      entrada('Sentadilla', rep(f, 4, 40, 10, 'limita el equilibrio, no la fuerza'), t(4, 8, 10)),
      entrada('Extensión de cuádriceps', rep(f, 4, 25, 12), t(3, 12, 12), 'Curl femoral'),
    ],
  },
  {
    fecha: dia('21'),
    dayKey: 'D4',
    entradas: (f) => [
      entrada('Remo en polea baja', rep(f, 4, 40, 10), t(4, 8, 10), 'Remo con barra'),
      entrada('Dominada agarre neutro', [set(f, null, 5, 'difíciles'), ...rep(f, 4, null, 4)], t(4, 8, 10), 'Jalón neutro'),
      entrada('Press militar sentado', [set(f, 10, 8)], t(3, 8, 10)),
      entrada('Elevaciones laterales', rep(f, 4, 2.5, 20), t(4, 15, 20)),
      entrada('Pájaros', [set(f, 2.5, 15, 'banco inclinado, pecho apoyado')], t(3, 15, 15)),
      entrada('Encogimientos', rep(f, 3, 10, 15), t(3, 12, 12)),
    ],
  },
  {
    fecha: dia('24'),
    dayKey: 'D1',
    entradas: (f) => [
      entrada('Jalón al pecho', rep(f, 4, 40, 8, 'dorsalera, costó'), t(4, 6, 8), 'Dominadas'),
      entrada('Press militar sentado', [set(f, 12.5, 8, 'con esfuerzo')], t(4, 6, 8)),
      entrada('Remo en polea baja', rep(f, 4, 40, 12, 'techo del rango'), t(3, 10, 12), 'Remo con mancuerna'),
      entrada('Elevaciones laterales', rep(f, 4, 5, 12, 'la última costó, no hay de 4 kg'), t(4, 12, 15)),
      entrada('Pullover en polea', rep(f, 3, 25, 12), t(3, 12, 12)),
      entrada('Face pull', [set(f, 15, 20)], t(3, 15, 15)),
    ],
  },
  {
    fecha: dia('25'),
    dayKey: 'D2',
    entradas: (f) => [
      entrada('Curl con mancuernas', rep(f, 4, 10, 10, 'barras ocupadas'), t(4, 8, 10), 'Curl con barra'),
      entrada('Curl inclinado con mancuernas', [set(f, 5, 10), set(f, 5, 12), set(f, 5, 10, 'controlando la bajada')], t(3, 10, 12)),
      entrada('Curl martillo', [set(f, 5, 15), set(f, 5, 15), set(f, 7.5, 18)], t(3, 12, 12)),
      entrada('Fondos', [set(f, null, 8), set(f, null, 8), set(f, null, 8), set(f, null, 6, 'en rack, rango completo')], t(4, 8, 10), 'Press cerrado'),
      entrada('Extensión sobre la cabeza', [set(f, 25, 12)], t(3, 10, 12)),
    ],
  },
];

const sesiones = SESIONES.map((s) => ({
  _id: uid(),
  ownerId: 'PENDIENTE',
  routineId: rutina._id,
  dayKey: s.dayKey,
  date: s.fecha,
  status: 'done',
  entries: s.entradas(s.fecha),
  syncState: 'local',
  clientUpdatedAt: ahora,
}));

const pesajes = [
  {
    _id: uid(),
    ownerId: 'PENDIENTE',
    date: dia('24'),
    kg: 63.9,
    measurements: { shoulders: null, chest: null, arm: null, waist: null },
    syncState: 'local',
    clientUpdatedAt: ahora,
  },
];

// Validar antes de escribir: si algo no pasa el esquema, el import lo iba a
// rechazar en silencio y es mejor enterarse aca.
const fallos = [];
if (!routineSchema.safeParse({ ...rutina, ownerId: 'x' }).success) {
  fallos.push('rutina: ' + JSON.stringify(routineSchema.safeParse({ ...rutina, ownerId: 'x' }).error.issues[0]));
}
sesiones.forEach((s, i) => {
  const r = sessionSchema.safeParse({ ...s, ownerId: 'x' });
  if (!r.success) fallos.push(`sesión ${i} (${s.dayKey}): ${r.error.issues[0].message} en ${r.error.issues[0].path.join('.')}`);
});
pesajes.forEach((b, i) => {
  const r = bodyweightEntrySchema.safeParse({ ...b, ownerId: 'x' });
  if (!r.success) fallos.push(`pesaje ${i}: ${r.error.issues[0].message}`);
});
if (fallos.length) {
  console.error('NO VÁLIDO:\n  ' + fallos.join('\n  '));
  process.exit(1);
}

process.stdout.write(
  JSON.stringify(
    {
      formato: 'tingym-backup',
      version: 1,
      exportadoEn: ahora,
      datos: {
        exercises: [],
        routines: [rutina],
        sessions: sesiones,
        bodyweight: pesajes,
        meals: [],
      },
    },
    null,
    2,
  ),
);
