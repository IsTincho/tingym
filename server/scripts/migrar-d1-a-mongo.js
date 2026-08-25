/**
 * Trae a Mongo lo que quedó en D1 durante el paso por Cloudflare.
 *
 * Los hashes de contraseña se copian tal cual: los dos backends usan el mismo
 * esquema (PBKDF2 en el cliente, SHA-256 con sal en el servidor), así que no
 * hace falta la contraseña de nadie para migrar.
 *
 * El volcado de D1 se genera aparte, porque wrangler necesita la cuenta de
 * Cloudflare:
 *
 *   cd worker
 *   npx wrangler d1 export tingym-db --remote --output ../d1-dump.sql
 *
 * y después, desde la raíz:
 *
 *   node server/scripts/migrar-d1-a-mongo.js d1-dump.sql "<URI_MONGO>"
 *
 * Es idempotente: escribe por _id, así que correrlo dos veces no duplica.
 */
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

const [DUMP, URI] = process.argv.slice(2);
if (!DUMP || !URI) {
  console.error('Uso: node server/scripts/migrar-d1-a-mongo.js <d1-dump.sql> "<URI_MONGO>"');
  process.exit(1);
}

const COLECCIONES = ['exercises', 'routines', 'sessions', 'bodyweight', 'meals'];

/**
 * Parser mínimo de los INSERT que genera `wrangler d1 export`: alcanza con
 * separar los valores respetando las comillas simples escapadas al estilo
 * SQLite (`''`). Traer un parser de SQL entero para leer un volcado propio
 * sería desproporcionado.
 */
function valoresDe(linea) {
  const desde = linea.indexOf('VALUES(');
  const inicio = desde === -1 ? linea.indexOf('VALUES (') : desde;
  if (inicio === -1) return null;
  const cuerpo = linea.slice(linea.indexOf('(', inicio) + 1, linea.lastIndexOf(')'));

  const valores = [];
  let actual = '';
  let enTexto = false;
  for (let i = 0; i < cuerpo.length; i += 1) {
    const c = cuerpo[i];
    if (enTexto) {
      if (c === "'" && cuerpo[i + 1] === "'") {
        actual += "'";
        i += 1;
      } else if (c === "'") {
        enTexto = false;
      } else {
        actual += c;
      }
    } else if (c === "'") {
      enTexto = true;
    } else if (c === ',') {
      valores.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  valores.push(actual.trim());
  return valores.map((v) => (v === 'NULL' ? null : v));
}

const sql = readFileSync(DUMP, 'utf8').split('\n');
const porTabla = new Map();

for (const linea of sql) {
  const m = linea.match(/^INSERT INTO ["`]?(\w+)["`]?/i);
  if (!m) continue;
  const tabla = m[1];
  if (tabla !== 'users' && !COLECCIONES.includes(tabla)) continue;
  const valores = valoresDe(linea);
  if (!valores) continue;
  if (!porTabla.has(tabla)) porTabla.set(tabla, []);
  porTabla.get(tabla).push(valores);
}

const client = new MongoClient(URI);

try {
  await client.connect();
  const db = client.db(process.env.MONGO_DB || 'gymapp');

  // users: (id, email, pass_hash, salt, name, role, gym_id, created_at, updated_at)
  for (const v of porTabla.get('users') ?? []) {
    const [id, email, passHash, salt, name, role, gymId, createdAt, updatedAt] = v;
    await db
      .collection('users')
      .replaceOne(
        { _id: id },
        { _id: id, email, passHash, salt, name, role, gymId, createdAt, updatedAt },
        { upsert: true },
      );
  }
  console.log(`users: ${(porTabla.get('users') ?? []).length}`);

  // El resto: (id, owner_id, updated_at, client_updated_at, data) — el
  // documento entero está en data, que es el que vale.
  for (const tabla of COLECCIONES) {
    const filas = porTabla.get(tabla) ?? [];
    for (const [id, , updatedAt, , data] of filas) {
      const doc = JSON.parse(data);
      await db
        .collection(tabla)
        .replaceOne({ _id: id }, { ...doc, _id: id, updatedAt }, { upsert: true });
    }
    console.log(`${tabla}: ${filas.length}`);
  }

  console.log('\nVerificación:');
  for (const tabla of ['users', ...COLECCIONES]) {
    const esperado = (porTabla.get(tabla) ?? []).length;
    const real = await db.collection(tabla).countDocuments();
    console.log(`  ${tabla}: dump ${esperado} → mongo ${real} ${real >= esperado ? '✓' : '✗'}`);
  }
} finally {
  await client.close();
}
