/**
 * Vuelca lo que hay en Mongo a un archivo .sql listo para D1.
 *
 * No escribe en D1 directamente: genera SQL y lo deja en disco, para poder
 * mirarlo antes de aplicarlo con `wrangler d1 execute --file`. Una migración
 * que no se puede revisar antes de correr no es una migración, es una apuesta.
 *
 * El usuario se recrea con el esquema de auth nuevo (PBKDF2 en el cliente +
 * SHA-256 con sal en el servidor), así que hay que pasarle la contraseña para
 * poder derivar la clave.
 *
 * Se migra un usuario a la vez, a propósito: la contraseña que se pasa es la
 * de ese usuario, y aplicarla a todas las cuentas de la base sería darles a
 * todas la misma clave.
 *
 * Uso:
 *   node worker/scripts/migrar-mongo-a-d1.js "<URI_MONGO>" <SALIDA.sql> <EMAIL> <PASSWORD>
 */
import { writeFileSync } from 'node:fs';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';

const [URI, SALIDA, EMAIL, PASSWORD] = process.argv.slice(2);
if (!URI || !SALIDA || !EMAIL || !PASSWORD) {
  console.error(
    'Uso: node worker/scripts/migrar-mongo-a-d1.js "<URI_MONGO>" <SALIDA.sql> <EMAIL> <PASSWORD>',
  );
  process.exit(1);
}

const COLECCIONES = ['exercises', 'routines', 'sessions', 'bodyweight', 'meals'];
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

// Mismos parámetros que client/src/db/authKey.js: si divergen, el login falla.
const deriveAuthKey = (email, password) =>
  pbkdf2Sync(password, `tingym|${email.toLowerCase().trim()}`, 210_000, 32, 'sha256').toString('hex');

const client = new MongoClient(URI);

try {
  await client.connect();
  const db = client.db(process.env.MONGO_DB || 'gymapp');
  const lineas = ['-- Generado por migrar-mongo-a-d1.js', 'PRAGMA foreign_keys = OFF;', ''];
  let total = 0;

  const u = await db.collection('users').findOne({ email: EMAIL.toLowerCase().trim() });
  if (!u) {
    console.error(`No existe el usuario ${EMAIL} en la base de origen`);
    process.exit(1);
  }

  {
    const salt = randomBytes(16).toString('hex');
    const authKey = deriveAuthKey(u.email, PASSWORD);
    const passHash = createHash('sha256').update(`${salt}|${authKey}`).digest('hex');
    lineas.push(
      `INSERT OR REPLACE INTO users (id, email, pass_hash, salt, name, role, gym_id, created_at, updated_at) VALUES (${q(u._id)}, ${q(u.email)}, ${q(passHash)}, ${q(salt)}, ${q(u.name)}, ${q(u.role ?? 'athlete')}, ${q(u.gymId)}, ${q(u.createdAt)}, ${q(u.updatedAt)});`,
    );
    total += 1;
  }

  // Sólo lo de este usuario, más el catálogo global (ownerId null).
  const filtro = { $or: [{ ownerId: u._id }, { ownerId: null }] };

  for (const tabla of COLECCIONES) {
    const docs = await db.collection(tabla).find(filtro).toArray();
    for (const doc of docs) {
      const { _id, ownerId, updatedAt, clientUpdatedAt } = doc;
      lineas.push(
        `INSERT OR REPLACE INTO ${tabla} (id, owner_id, updated_at, client_updated_at, data) VALUES (${q(_id)}, ${q(ownerId ?? null)}, ${q(updatedAt ?? new Date().toISOString())}, ${q(clientUpdatedAt ?? null)}, ${q(JSON.stringify(doc))});`,
      );
      total += 1;
    }
    console.log(`${tabla}: ${docs.length} documentos`);
  }

  writeFileSync(SALIDA, `${lineas.join('\n')}\n`, 'utf8');
  console.log(`\n${total} filas escritas en ${SALIDA}`);
} finally {
  await client.close();
}
