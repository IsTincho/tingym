import { db, getMeta, setMeta } from './db.js';
import { getCurrentUserId } from './repo.js';
import { bodyweightEntrySchema, mealSchema, newId, nowIso } from '@gym/shared';

// --- peso corporal --------------------------------------------------------

export function listBodyweight({ limit = 200 } = {}) {
  return db.bodyweight.orderBy('date').reverse().limit(limit).toArray();
}

export async function logBodyweight({ kg, date = null, measurements = {} }) {
  const ownerId = await getCurrentUserId();
  const ts = nowIso();
  // Los campos vacios del formulario llegan como '' y como null: los dos
  // significan "no me medi esto hoy", y el esquema espera null.
  const cm = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const doc = bodyweightEntrySchema.parse({
    _id: newId(),
    ownerId,
    date: date ?? ts,
    kg: Number(kg),
    measurements: {
      shoulders: cm(measurements.shoulders),
      chest: cm(measurements.chest),
      arm: cm(measurements.arm),
      waist: cm(measurements.waist),
    },
    syncState: 'local',
    clientUpdatedAt: ts,
  });
  await db.bodyweight.put(doc);
  return doc;
}

export function deleteBodyweight(id) {
  return db.bodyweight.delete(id);
}

/**
 * El pesaje es semanal y siempre el mismo dia (lunes en ayunas): comparar
 * dias sueltos mide el asado del domingo, no la tendencia.
 */
export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day; // retrocede al lunes
  d.setDate(d.getDate() + diff);
  return d;
}

export function isSameWeek(a, b) {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

/** ¿Falta el pesaje de esta semana? Alimenta el recordatorio del inicio. */
export async function pendingWeeklyWeighIn() {
  const [last] = await db.bodyweight.orderBy('date').reverse().limit(1).toArray();
  if (!last) return { pending: true, last: null };
  return { pending: !isSameWeek(new Date(last.date), new Date()), last };
}

// --- comidas --------------------------------------------------------------

export function listMeals({ limit = 200 } = {}) {
  return db.meals.orderBy('date').reverse().limit(limit).toArray();
}

export async function listMealsOfDay(date = new Date()) {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const all = await db.meals
    .where('date')
    .between(from.toISOString(), to.toISOString())
    .toArray();
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export async function logMeal({ slot, description, kcal = null, proteinG = null, date = null }) {
  const ownerId = await getCurrentUserId();
  const ts = nowIso();
  const doc = mealSchema.parse({
    _id: newId(),
    ownerId,
    date: date ?? ts,
    slot,
    description,
    kcal: kcal === '' || kcal == null ? null : Number(kcal),
    proteinG: proteinG === '' || proteinG == null ? null : Number(proteinG),
    syncState: 'local',
    clientUpdatedAt: ts,
  });
  await db.meals.put(doc);
  return doc;
}

export function deleteMeal(id) {
  return db.meals.delete(id);
}

// Objetivo diario de proteina, en gramos. `null` = sin objetivo, y en ese caso
// la pantalla de comidas no muestra ninguna barra: un objetivo inventado es
// peor que ninguno.
//
// Vive en `meta` y no en una coleccion sincronizada: es una preferencia de una
// sola linea. Ojo con eso —no viaja al servidor, asi que en un telefono nuevo
// hay que volver a cargarlo. Es un numero, y agregar una coleccion al sync
// para un numero no se paga.
const CLAVE_PROTEINA = 'proteinTargetG';

export function getProteinTarget() {
  return getMeta(CLAVE_PROTEINA, null);
}

export function setProteinTarget(gramos) {
  const n = Number(gramos);
  return setMeta(CLAVE_PROTEINA, Number.isFinite(n) && n > 0 ? Math.round(n) : null);
}
