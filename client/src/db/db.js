import Dexie from 'dexie';

export const db = new Dexie('gymapp');

// Cada cambio de tablas o indices necesita su propia version: Dexie solo
// aplica el upgrade cuando el numero sube, asi que editar una version ya
// publicada deja sin crear la tabla a quien ya tenia la app instalada.
db.version(1).stores({
  // _id primero = primary key. El resto son indices.
  exercises: '_id, name, muscleGroup, ownerId',
  routines: '_id, ownerId, updatedAt, syncState',
  // exerciseIds es un indice multiEntry denormalizado: es lo que hace barato
  // "traeme la ultima sesion en la que hice este ejercicio" (M4).
  sessions: '_id, ownerId, date, status, routineId, syncState, *exerciseIds',
  bodyweight: '_id, ownerId, date',
  meta: 'key',
});

// v2: diario de comidas.
db.version(2).stores({
  meals: '_id, ownerId, date',
});

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}
