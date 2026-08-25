/**
 * Copia todas las colecciones de una base Mongo a otra. Pensado para pasar de
 * la Mongo de Railway a un cluster M0 de Atlas sin perder nada.
 *
 * Copia por upsert sobre _id, así que es idempotente: si se corta a la mitad,
 * se vuelve a correr y no duplica nada.
 *
 * Uso:
 *   node server/scripts/migrar-mongo.js "<URI_ORIGEN>" "<URI_DESTINO>"
 *
 * Las URIs van entre comillas: llevan caracteres que el shell interpreta.
 */
import { MongoClient } from 'mongodb';

const [ORIGEN, DESTINO] = process.argv.slice(2);
if (!ORIGEN || !DESTINO) {
  console.error('Uso: node server/scripts/migrar-mongo.js "<URI_ORIGEN>" "<URI_DESTINO>"');
  process.exit(1);
}

const NOMBRE_DB = process.env.MONGO_DB || 'gymapp';
const COLECCIONES = ['users', 'exercises', 'routines', 'sessions', 'bodyweight', 'meals'];

const origen = new MongoClient(ORIGEN);
const destino = new MongoClient(DESTINO);

try {
  await origen.connect();
  await destino.connect();
  const desde = origen.db(NOMBRE_DB);
  const hacia = destino.db(NOMBRE_DB);

  for (const nombre of COLECCIONES) {
    const docs = await desde.collection(nombre).find({}).toArray();
    if (docs.length === 0) {
      console.log(`${nombre}: vacía, nada que copiar`);
      continue;
    }
    const r = await hacia.collection(nombre).bulkWrite(
      docs.map((doc) => ({
        replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
      })),
      { ordered: false },
    );
    console.log(
      `${nombre}: ${docs.length} documentos (${r.upsertedCount} nuevos, ${r.modifiedCount} actualizados)`,
    );
  }

  // Verificación: los conteos de las dos puntas tienen que coincidir antes de
  // que alguien se anime a borrar la base vieja.
  console.log('\nVerificación:');
  let todoOk = true;
  for (const nombre of COLECCIONES) {
    const a = await desde.collection(nombre).countDocuments();
    const b = await hacia.collection(nombre).countDocuments();
    const ok = b >= a;
    if (!ok) todoOk = false;
    console.log(`  ${nombre}: origen ${a} → destino ${b} ${ok ? '✓' : '✗'}`);
  }

  console.log(
    todoOk
      ? '\nMigración completa. Ya podés apuntar MONGO_URL al cluster nuevo.'
      : '\nFaltan documentos en el destino. NO borres la base vieja: volvé a correr esto.',
  );
  process.exit(todoOk ? 0 : 1);
} finally {
  await origen.close();
  await destino.close();
}
