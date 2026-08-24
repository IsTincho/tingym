import Dexie from 'dexie';

export const db = new Dexie('gymapp');

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

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}
