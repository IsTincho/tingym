const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/** "hoy" / "ayer" / "hace 3 días" / "mar 12 ago". Lo que sirve entre series. */
export function relativeDate(iso, now = new Date()) {
  const d = new Date(iso);
  const dias = Math.floor((startOfDay(now) - startOfDay(d)) / 864e5);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function shortDate(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 42.5 -> "42,5"; 40 -> "40". Coma decimal, sin ceros de relleno. */
// Numero decimal en castellano: la coma es el separador. Redondea a dos
// decimales porque ni una balanza ni una cinta metrica dan mas precision.
function decimal(value) {
  if (value == null) return '—';
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

// Dos nombres para la misma funcion, no dos implementaciones. Se leen distinto
// en cada pantalla —`kg(peso)` y `cm(brazo)`— pero la convencion decimal es la
// misma y tiene que seguir siendolo.
export const kg = decimal;
export const cm = decimal;

export function restLabel(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

/** "12,5 × 8" o "8 reps" cuando no hay carga. */
export function setLabel(set) {
  if (set.weightKg == null) return `${set.reps} reps`;
  return `${kg(set.weightKg)} × ${set.reps}`;
}

export function setsLabel(sets) {
  const done = (sets ?? []).filter((s) => Number(s.reps) > 0);
  if (done.length === 0) return 'sin series';
  return done.map(setLabel).join(' · ');
}

export function weekLabel(iso) {
  const d = new Date(iso);
  const fin = new Date(d);
  fin.setDate(fin.getDate() + 6);
  return `${d.getDate()} ${MESES[d.getMonth()]} — ${fin.getDate()} ${MESES[fin.getMonth()]}`;
}

export function monthLabel(iso) {
  const d = new Date(iso);
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
