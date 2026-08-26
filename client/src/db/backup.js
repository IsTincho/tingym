import { db } from './db.js';
import {
  bodyweightEntrySchema,
  exerciseSchema,
  mealSchema,
  routineSchema,
  sessionSchema,
} from '@gym/shared';
import { getCurrentUserId } from './repo.js';
import { withIndex } from './sessionRepo.js';

// Exportar e importar todo en un JSON.
//
// Existe porque la app es local-first sin cuenta obligatoria: si no sincronizás,
// TODO vive en el IndexedDB de un navegador. Un "borrar datos de sitio", un
// telefono nuevo o una PWA desinstalada y no queda nada. Sin esto, la unica
// copia de un año de entrenamientos depende de que nadie toque la
// configuracion del navegador.
//
// Tambien es la puerta para entrar datos que ya existen en otro lado —una
// planilla, un markdown— sin tener que tipear seis sesiones a mano.

const COLECCIONES = {
  exercises: exerciseSchema,
  routines: routineSchema,
  sessions: sessionSchema,
  bodyweight: bodyweightEntrySchema,
  meals: mealSchema,
};

// Sube cuando el formato cambie de forma incompatible. Hoy no hay migraciones
// de backup y no deberia hacer falta: los esquemas de Zod ya toleran campos
// nuevos con default, que es como se agregaron `warmup` y `measurements`.
const VERSION = 1;

export async function exportarTodo() {
  const datos = {};
  for (const nombre of Object.keys(COLECCIONES)) {
    // El catalogo global (ownerId null) no viaja: se siembra solo en cada
    // dispositivo y meterlo duplicaria 48 ejercicios en cada backup.
    const todo = await db[nombre].toArray();
    datos[nombre] = nombre === 'exercises' ? todo.filter((e) => e.ownerId != null) : todo;
  }
  return {
    formato: 'tingym-backup',
    version: VERSION,
    exportadoEn: new Date().toISOString(),
    datos,
  };
}

/**
 * Importa un backup.
 *
 * `modo: 'merge'` (por defecto) pisa lo que coincide por `_id` y deja el resto;
 * `modo: 'replace'` borra las colecciones del backup antes de escribir.
 *
 * Valida documento por documento con el mismo Zod que usa el servidor y devuelve
 * lo que rechazo en vez de tirar: un backup con una fila rota tiene que poder
 * importar las otras doscientas. Mejor entrar incompleto y saberlo que no
 * entrar.
 *
 * Reescribe `ownerId` al usuario local, porque un backup exportado desde otro
 * dispositivo trae el id de aquel y si no, los datos entran invisibles.
 */
export async function importar(json, { modo = 'merge' } = {}) {
  if (json?.formato !== 'tingym-backup') {
    throw new Error('Esto no parece un backup de TINGYM');
  }
  if (Number(json.version) > VERSION) {
    throw new Error('El backup es de una versión más nueva de la app');
  }

  const ownerId = await getCurrentUserId();
  const resumen = { importados: {}, rechazados: [] };

  for (const [nombre, schema] of Object.entries(COLECCIONES)) {
    const filas = Array.isArray(json.datos?.[nombre]) ? json.datos[nombre] : [];
    const validas = [];

    for (const cruda of filas) {
      // El catalogo global se identifica con ownerId null y no se toca.
      const esGlobal = nombre === 'exercises' && cruda?.ownerId === null;
      const check = schema.safeParse(esGlobal ? cruda : { ...cruda, ownerId });
      if (!check.success) {
        resumen.rechazados.push({
          coleccion: nombre,
          _id: cruda?._id ?? '(sin id)',
          error: check.error.issues[0].message,
        });
        continue;
      }
      // Entra como 'local' para que el proximo sync lo empuje al servidor.
      //
      // Las sesiones ademas necesitan el indice denormalizado `exerciseIds`:
      // no es parte del esquema —es detalle del cliente— asi que Zod lo
      // descarta, y sin el las sesiones entran invisibles para "la ultima vez
      // que hiciste este ejercicio". Se ve feo y es facil de olvidar: paso.
      const doc = { ...check.data, syncState: 'local' };
      validas.push(nombre === 'sessions' ? withIndex(doc) : doc);
    }

    if (modo === 'replace' && filas.length) {
      await db[nombre].where('ownerId').equals(ownerId).delete();
    }
    if (validas.length) await db[nombre].bulkPut(validas);
    resumen.importados[nombre] = validas.length;
  }

  return resumen;
}
