// Baja las fotos de los ejercicios desde Free Exercise DB y las deja en
// client/public/exercises/<id>/, renombradas con NUESTRO id.
//
// Por que renombrar en vez de guardar una tabla de equivalencias en runtime:
// la ruta queda derivada del id del ejercicio, que ya es estable (sale del
// nombre, ver catalog.js). La app no necesita saber que Free Exercise DB
// existe, y el dia que cambiemos de fuente no se toca una linea de la UI.
//
// Fuente: https://github.com/yuhonas/free-exercise-db
// Licencia: Unlicense (dominio publico). No exige atribucion; la dejamos
// igual en client/public/exercises/FUENTE.txt porque el que herede esto
// merece saber de donde salieron.
//
// Correr con: npm run fetch:exercise-images
// Es idempotente: lo ya bajado no se vuelve a pedir.

import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_EXERCISES, exerciseId } from '../shared/src/catalog.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'client', 'public', 'exercises');
const MANIFIESTO = join(RAIZ, 'shared', 'src', 'exercisePhotos.js');

const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';

// Nuestro nombre -> id en Free Exercise DB.
//
// La clave es el nombre tal cual esta en el catalogo, no el id derivado: si
// alguien renombra un ejercicio, este script explota en vez de dejar la foto
// vieja pegada a un ejercicio que ya no es ese.
//
// null = no hay equivalente decente. Preferimos sin foto a una foto de otro
// ejercicio: el que mira la foto la mira porque no sabe como se hace, y una
// foto parecida-pero-no es peor que ninguna.
const MAPA = {
  // espalda
  'Dominadas': 'Pullups',
  'Dominada supina': 'Chin-Up',
  'Dominada agarre neutro': 'V-Bar_Pullup',
  'Jalón al pecho': 'Wide-Grip_Lat_Pulldown',
  'Jalón neutro': 'V-Bar_Pulldown',
  'Remo con barra': 'Bent_Over_Barbell_Row',
  'Remo con mancuerna': 'One-Arm_Dumbbell_Row',
  'Remo en polea baja': 'Seated_Cable_Rows',
  'Pullover en polea': 'Straight-Arm_Pulldown',
  'Encogimientos': 'Dumbbell_Shrug',

  // hombros
  'Press militar sentado': 'Dumbbell_Shoulder_Press',
  'Press militar con barra': 'Standing_Military_Press',
  'Press Arnold': 'Arnold_Dumbbell_Press',
  'Elevaciones laterales': 'Side_Lateral_Raise',
  'Pájaros': 'Lying_Rear_Delt_Raise',
  'Face pull': 'Face_Pull',
  'Deltoide posterior en máquina': 'Reverse_Machine_Flyes',

  // pecho
  'Press banca': 'Barbell_Bench_Press_-_Medium_Grip',
  'Press banca en máquina': 'Machine_Bench_Press',
  'Press inclinado con mancuernas': 'Incline_Dumbbell_Press',
  'Aperturas con mancuernas': 'Dumbbell_Flyes',
  'Aperturas en polea': 'Cable_Crossover',
  'Pec deck': 'Butterfly',
  'Fondos': 'Dips_-_Chest_Version',

  // biceps
  'Curl con barra': 'Barbell_Curl',
  'Curl con mancuernas': 'Dumbbell_Bicep_Curl',
  'Curl inclinado con mancuernas': 'Incline_Dumbbell_Curl',
  'Curl martillo': 'Hammer_Curls',

  // triceps
  'Extensión en polea': 'Triceps_Pushdown',
  'Extensión sobre la cabeza': 'Cable_Rope_Overhead_Triceps_Extension',
  'Press cerrado': 'Close-Grip_Barbell_Bench_Press',
  'Press francés': 'Lying_Triceps_Press',

  // piernas
  'Sentadilla': 'Barbell_Squat',
  'Prensa': 'Leg_Press',
  'Peso muerto': 'Barbell_Deadlift',
  'Peso muerto rumano': 'Romanian_Deadlift',
  'Hip thrust': 'Barbell_Hip_Thrust',
  'Zancadas': 'Dumbbell_Lunges',
  'Curl femoral': 'Lying_Leg_Curls',
  'Extensión de cuádriceps': 'Leg_Extensions',
  'Elevación de gemelos': 'Standing_Calf_Raises',

  // core
  'Plancha': 'Plank',
  'Plancha lateral': 'Side_Bridge',
  'Rueda abdominal': 'Ab_Roller',
  'Elevación de piernas colgado': 'Hanging_Leg_Raise',

  // Sin equivalente en la fuente. Explicitos a proposito: si quedaran afuera
  // del mapa, la verificacion de abajo no podria distinguir "no hay foto" de
  // "se nos olvido mapearlo".
  'Plancha lateral con elevación de cadera': null,
  'Hollow hold': null,
  'Plancha con toque de hombros': null,
};

async function existe(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const indice = await fetch(BASE + '/dist/exercises.json').then((r) => {
  if (!r.ok) throw new Error('No se pudo bajar el indice: HTTP ' + r.status);
  return r.json();
});
const porId = new Map(indice.map((e) => [e.id, e]));

// Tres verificaciones antes de bajar un solo byte. Las tres son la misma idea:
// que el mapa y la realidad no se separen en silencio.
const sinMapear = SEED_EXERCISES.filter((e) => !(e.name in MAPA)).map((e) => e.name);
if (sinMapear.length) {
  throw new Error('Ejercicios del catalogo sin entrada en MAPA:\n  ' + sinMapear.join('\n  '));
}
const sobrantes = Object.keys(MAPA).filter((n) => !SEED_EXERCISES.some((e) => e.name === n));
if (sobrantes.length) {
  throw new Error('Entradas de MAPA que ya no existen en el catalogo:\n  ' + sobrantes.join('\n  '));
}
const rotos = Object.entries(MAPA).filter(([, id]) => id && !porId.has(id));
if (rotos.length) {
  throw new Error(
    'Ids que no existen en Free Exercise DB:\n  ' +
      rotos.map(([n, id]) => n + ' -> ' + id).join('\n  '),
  );
}

await mkdir(DESTINO, { recursive: true });

const conFoto = {};
let bajadas = 0;
let saltadas = 0;

for (const [nombre, fuenteId] of Object.entries(MAPA)) {
  if (!fuenteId) continue;
  const id = exerciseId(nombre);
  const imagenes = porId.get(fuenteId).images ?? [];
  if (!imagenes.length) continue;

  const carpeta = join(DESTINO, id);
  await mkdir(carpeta, { recursive: true });

  for (let i = 0; i < imagenes.length; i++) {
    const destino = join(carpeta, i + '.jpg');
    if (await existe(destino)) {
      saltadas++;
      continue;
    }
    const url = BASE + '/exercises/' + imagenes[i].split('/').map(encodeURIComponent).join('/');
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' bajando ' + url);
    await writeFile(destino, Buffer.from(await res.arrayBuffer()));
    bajadas++;
    process.stdout.write('\r  bajadas ' + bajadas + ', ya estaban ' + saltadas + '   ');
  }
  conFoto[id] = imagenes.length;
}

const sinFoto = SEED_EXERCISES.filter((e) => !conFoto[e._id]);

const ordenado = Object.fromEntries(
  Object.entries(conFoto).sort(([a], [b]) => a.localeCompare(b)),
);

const manifiesto = [
  '// GENERADO por scripts/fetch-exercise-images.mjs. No editar a mano.',
  '//',
  '// Cuantas fotos tiene cada ejercicio en client/public/exercises/<id>/.',
  '// Las fotos salen de Free Exercise DB (Unlicense, dominio publico).',
  '//',
  '// Se commitea generado en vez de calcularse en build para que el cliente no',
  '// tenga que salir a preguntar si hay foto antes de decidir si dibuja el hueco:',
  '// sin esto, cada ejercicio sin foto cuesta un 404, y sin senal cuesta una',
  '// espera hasta el timeout.',
  '',
  'export const EXERCISE_PHOTOS = ' + JSON.stringify(ordenado, null, 2) + ';',
  '',
  'export function exercisePhotos(exerciseId) {',
  '  const n = EXERCISE_PHOTOS[exerciseId] ?? 0;',
  '  return Array.from({ length: n }, (_, i) => `/exercises/${exerciseId}/${i}.jpg`);',
  '}',
  '',
].join('\n');
await writeFile(MANIFIESTO, manifiesto, 'utf8');

await writeFile(
  join(DESTINO, 'FUENTE.txt'),
  [
    'Fotos de https://github.com/yuhonas/free-exercise-db',
    'Licencia: Unlicense (dominio publico). No exige atribucion.',
    '',
    'Renombradas al id de ejercicio de esta app por',
    'scripts/fetch-exercise-images.mjs. La tabla de equivalencias vive en ese',
    'script, no aca.',
    '',
  ].join('\n'),
  'utf8',
);

console.log('\n\nFotos: ' + bajadas + ' bajadas, ' + saltadas + ' ya estaban.');
console.log(
  'Ejercicios con foto: ' + Object.keys(conFoto).length + ' de ' + SEED_EXERCISES.length,
);
if (sinFoto.length) {
  console.log('Sin foto (a proposito): ' + sinFoto.map((e) => e.name).join(', '));
}
