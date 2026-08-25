/**
 * Termina de conectar la app con Mongo Atlas, en un solo paso.
 *
 * Hace lo que no se puede hacer sin la connection string, que es lo único que
 * queda del lado de la persona: la URI lleva la contraseña de la base adentro
 * y no tiene por qué pasar por ningún lado más que por acá.
 *
 * En orden:
 *   1. prueba la conexión al cluster
 *   2. importa a Mongo los datos que quedaron en D1
 *   3. guarda MONGO_URL en el servicio de Railway
 *   4. lo despliega y espera a que responda
 *   5. reconstruye el frontend apuntando a esa API y lo publica
 *
 * Uso, desde la raíz del repo:
 *   node server/scripts/finalizar-setup.js "<URI_ATLAS>"
 *
 * Es seguro correrlo más de una vez: la importación escribe por _id y el
 * resto son operaciones idempotentes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { MongoClient } from 'mongodb';

const [URI] = process.argv.slice(2);
if (!URI) {
  console.error('Uso: node server/scripts/finalizar-setup.js "<URI_ATLAS>"');
  process.exit(1);
}
if (!/^mongodb(\+srv)?:\/\//.test(URI)) {
  console.error('Eso no parece una connection string de Mongo (tiene que empezar con mongodb+srv://)');
  process.exit(1);
}

const CUENTA_CLOUDFLARE = 'f1f96e941312e5e727168d7d498e03fa';
const DUMP = 'd1-dump.sql';

const paso = (n, texto) => console.log(`\n[${n}/5] ${texto}`);
const correr = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });

// 1 --------------------------------------------------------------------
paso(1, 'Probando la conexión al cluster');
{
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 15_000 });
  try {
    await client.connect();
    await client.db(process.env.MONGO_DB || 'gymapp').command({ ping: 1 });
    console.log('    conecta bien');
  } catch (err) {
    console.error(`    no conecta: ${err.message}`);
    console.error('    Revisá que en Network Access de Atlas esté permitido 0.0.0.0/0.');
    process.exit(1);
  } finally {
    await client.close();
  }
}

// 2 --------------------------------------------------------------------
paso(2, 'Importando los datos que quedaron en D1');
if (existsSync(DUMP)) {
  correr('node', ['server/scripts/migrar-d1-a-mongo.js', DUMP, `"${URI}"`]);
} else {
  console.log(`    no hay ${DUMP}, se saltea (generalo con: cd worker && npx wrangler d1 export tingym-db --remote --output ../${DUMP})`);
}

// 3 --------------------------------------------------------------------
paso(3, 'Guardando MONGO_URL en Railway');
correr('railway', ['variables', '--service', 'api', '--set', `"MONGO_URL=${URI}"`, '--skip-deploys']);

// 4 --------------------------------------------------------------------
paso(4, 'Desplegando la API');
correr('railway', ['up', '--service', 'api', '--detach']);

const dominio = (() => {
  try {
    // Si el servicio todavía no tiene dominio público, se le genera uno.
    const salida = execFileSync('railway', ['domain', '--service', 'api', '--port', '3000'], {
      encoding: 'utf8',
      shell: true,
    });
    const m = salida.match(/https:\/\/[^\s]+/);
    return m ? m[0] : null;
  } catch {
    return null;
  }
})();

if (!dominio) {
  console.error('    no se pudo obtener el dominio del servicio; miralo en el dashboard y seguí a mano');
  process.exit(1);
}
console.log(`    dominio: ${dominio}`);

process.stdout.write('    esperando a que responda');
let viva = false;
for (let i = 0; i < 40; i += 1) {
  try {
    const res = await fetch(`${dominio}/api/health`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      viva = true;
      break;
    }
  } catch {
    // todavía compilando
  }
  process.stdout.write('.');
  await new Promise((r) => setTimeout(r, 10_000));
}
console.log('');
if (!viva) {
  console.error('    la API no respondió a tiempo. Mirá los logs con: railway logs --service api');
  process.exit(1);
}
console.log('    responde');

// 5 --------------------------------------------------------------------
paso(5, 'Publicando el frontend contra esa API');
correr('npm', ['run', 'build'], {
  env: { ...process.env, VITE_API_URL: dominio },
});
correr(
  'npx',
  [
    'wrangler',
    'pages',
    'deploy',
    'client/dist',
    '--project-name',
    'tingym',
    '--branch',
    'main',
    '--commit-dirty=true',
  ],
  { env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: CUENTA_CLOUDFLARE } },
);

console.log(`
Listo.
  App:  https://tingym.pages.dev
  API:  ${dominio}

Acordate de dejar VITE_API_URL en client/.env.production apuntando a ${dominio},
para que los deploys que no pasen por este script queden igual.
`);
