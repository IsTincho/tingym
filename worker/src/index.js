import { z } from 'zod';
import {
  bodyweightEntrySchema,
  deterministicVerdict,
  exerciseSchema,
  mealSchema,
  newId,
  routineSchema,
  sessionSchema,
  setSchema,
} from '@gym/shared';
import { hashAuthKey, randomSalt, requireAuth, safeEqual, signToken } from './auth.js';
import { SYSTEM_PROMPT, llmConfig, parseVerdict, userPrompt } from './coach.js';

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(), ...extra },
  });

const error = (mensaje, status) => json({ error: mensaje }, status);

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Qué colecciones viajan y con qué esquema se valida cada una. El servidor no
// confía en lo que manda el cliente: valida con el mismo Zod compartido.
const COLECCIONES = {
  exercises: exerciseSchema,
  routines: routineSchema,
  sessions: sessionSchema,
  bodyweight: bodyweightEntrySchema,
  meals: mealSchema,
};

// --- auth -----------------------------------------------------------------

const credenciales = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  // No es la contraseña: es PBKDF2(contraseña) hecho en el cliente. Ver auth.js.
  authKey: z.string().regex(/^[0-9a-f]{64}$/, 'authKey inválida'),
  name: z.string().trim().min(1).max(80).optional(),
  localUserId: z.string().min(1).max(64).optional(),
});

async function registrar(request, env) {
  const parsed = credenciales.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const { email, authKey, name, localUserId } = parsed.data;

  const existente = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existente) return error('Ese email ya está registrado', 409);

  const salt = randomSalt();
  const ahora = new Date().toISOString();
  const user = {
    // El cliente ya venía generando datos offline bajo un id local: adoptarlo
    // como id de usuario evita migrar nada de lo que ya está en el teléfono.
    id: localUserId ?? newId(),
    email,
    pass_hash: await hashAuthKey(authKey, salt),
    salt,
    name: name ?? email.split('@')[0],
    role: 'athlete',
    gym_id: null,
    created_at: ahora,
    updated_at: ahora,
  };

  try {
    await env.DB.prepare(
      `INSERT INTO users (id, email, pass_hash, salt, name, role, gym_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        user.id,
        user.email,
        user.pass_hash,
        user.salt,
        user.name,
        user.role,
        user.gym_id,
        user.created_at,
        user.updated_at,
      )
      .run();
  } catch (err) {
    // Choque de id: el id local ya lo usa otra cuenta. Se reintenta con uno
    // nuevo, porque el usuario no puede hacer nada al respecto.
    if (!String(err).includes('UNIQUE')) throw err;
    user.id = newId();
    await env.DB.prepare(
      `INSERT INTO users (id, email, pass_hash, salt, name, role, gym_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        user.id,
        user.email,
        user.pass_hash,
        user.salt,
        user.name,
        user.role,
        user.gym_id,
        user.created_at,
        user.updated_at,
      )
      .run();
  }

  return json(
    {
      token: await signToken(user, env.JWT_SECRET),
      user: { _id: user.id, email: user.email, name: user.name, role: user.role },
    },
    201,
  );
}

async function entrar(request, env) {
  const parsed = credenciales.pick({ email: true, authKey: true }).safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) return error('Datos inválidos', 400);

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(parsed.data.email)
    .first();

  // Mismo mensaje para email inexistente y contraseña incorrecta: distinguirlos
  // convierte el login en un verificador de qué emails están registrados.
  if (!user) return error('Email o contraseña incorrectos', 401);
  const hash = await hashAuthKey(parsed.data.authKey, user.salt);
  if (!safeEqual(hash, user.pass_hash)) return error('Email o contraseña incorrectos', 401);

  return json({
    token: await signToken(user, env.JWT_SECRET),
    user: { _id: user.id, email: user.email, name: user.name, role: user.role },
  });
}

async function cambiarPassword(request, env, usuario) {
  const parsed = z
    .object({
      currentAuthKey: z.string().regex(/^[0-9a-f]{64}$/),
      newAuthKey: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return error('Datos inválidos', 400);

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(usuario.id).first();
  if (!user) return error('Usuario inexistente', 404);

  // Se pide la actual aunque el token ya autentique: un token robado no
  // alcanza para quedarse con la cuenta cambiándole la contraseña.
  const hash = await hashAuthKey(parsed.data.currentAuthKey, user.salt);
  if (!safeEqual(hash, user.pass_hash)) return error('La contraseña actual no coincide', 401);

  const salt = randomSalt();
  await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ?, updated_at = ? WHERE id = ?')
    .bind(await hashAuthKey(parsed.data.newAuthKey, salt), salt, new Date().toISOString(), user.id)
    .run();

  return json({ token: await signToken(user, env.JWT_SECRET) });
}

// --- sync -----------------------------------------------------------------

const cuerpoSync = z.object({
  since: z.string().datetime().nullable().optional(),
  changes: z.record(z.string(), z.array(z.unknown())).default({}),
});

async function sincronizar(request, env, usuario) {
  const parsed = cuerpoSync.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return error('Payload inválido', 400);

  const { since, changes } = parsed.data;
  const ownerId = usuario.id;
  const serverTime = new Date().toISOString();
  const applied = {};
  const rejected = [];
  const sentencias = [];

  for (const [tabla, schema] of Object.entries(COLECCIONES)) {
    const docs = changes[tabla] ?? [];
    applied[tabla] = 0;

    for (const crudo of docs) {
      const check = schema.safeParse(crudo);
      if (!check.success) {
        rejected.push({ collection: tabla, _id: crudo?._id, error: check.error.issues[0].message });
        continue;
      }
      const doc = check.data;

      // El ownerId sale del token, nunca del payload: sin esto un cliente
      // podría escribir documentos dentro de la cuenta de otro. El catálogo
      // global (ownerId null) es la única excepción.
      const owner = tabla === 'exercises' && doc.ownerId == null ? null : ownerId;
      doc.ownerId = owner;
      const clientUpdatedAt = doc.clientUpdatedAt ?? doc.updatedAt ?? serverTime;

      sentencias.push(
        env.DB.prepare(
          `INSERT INTO ${tabla} (id, owner_id, updated_at, client_updated_at, data)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(id) DO UPDATE SET
             owner_id = ?2, updated_at = ?3, client_updated_at = ?4, data = ?5
           -- El corazón del last-write-wins: sólo pisa si lo que llega es más
           -- nuevo que lo guardado.
           WHERE excluded.client_updated_at >= ${tabla}.client_updated_at
              OR ${tabla}.client_updated_at IS NULL`,
        ).bind(doc._id, owner, serverTime, clientUpdatedAt, JSON.stringify(doc)),
      );
      applied[tabla] += 1;
    }
  }

  if (sentencias.length > 0) await env.DB.batch(sentencias);

  // Pull: todo lo del usuario tocado después de `since`.
  const pulled = {};
  for (const tabla of Object.keys(COLECCIONES)) {
    const filtroFecha = since ? 'AND updated_at > ?2' : '';
    const sql =
      tabla === 'exercises'
        ? `SELECT data FROM exercises WHERE (owner_id = ?1 OR owner_id IS NULL) ${filtroFecha} LIMIT 2000`
        : `SELECT data FROM ${tabla} WHERE owner_id = ?1 ${filtroFecha} LIMIT 2000`;
    const stmt = since
      ? env.DB.prepare(sql).bind(ownerId, since)
      : env.DB.prepare(sql).bind(ownerId);
    const { results } = await stmt.all();
    pulled[tabla] = results.map((r) => JSON.parse(r.data));
  }

  return json({ serverTime, applied, rejected, changes: pulled });
}

// --- coach ----------------------------------------------------------------

const cuerpoVerdict = z.object({
  exerciseName: z.string().max(120).default('el ejercicio'),
  loadType: z.string().max(30).default('barbell'),
  sets: z.array(setSchema.partial({ loggedAt: true })).min(1),
  target: z.object({
    targetSets: z.number().int().min(1).max(12),
    repRangeMin: z.number().int().min(1).max(100),
    repRangeMax: z.number().int().min(1).max(100),
    restSeconds: z.number().int().min(0).max(600).optional(),
    note: z.string().max(300).optional(),
  }),
  history: z
    .array(z.object({ date: z.string(), sets: z.array(setSchema.partial({ loggedAt: true })) }))
    .max(3)
    .default([]),
  context: z
    .object({
      exerciseNumber: z.number().int().min(1).max(30).optional(),
      consecutiveDay: z.boolean().optional(),
      userNote: z.string().max(300).optional(),
    })
    .default({}),
});

async function veredicto(request, env, usuario) {
  const parsed = cuerpoVerdict.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0].message, 400);
  const input = parsed.data;

  // El fallback se calcula SIEMPRE y primero: si la IA falla, se agota la
  // cuota o el modelo devuelve cualquier cosa, igual hay veredicto.
  const fallback = deterministicVerdict({
    sets: input.sets,
    target: input.target,
    loadType: input.loadType,
  });

  // Mismo criterio que el server de Express (ver server/src/llm.js): el
  // proveedor se elige por variable y se habla el formato de OpenAI, que es
  // el que entienden Groq, Gemini y casi todos. Acá va duplicado y no
  // importado porque `shared` es codigo puro sin red, a proposito, y el
  // Worker no puede leer process.env.
  const llm = llmConfig(env);
  if (!llm) {
    return json({ verdict: fallback, degraded: 'sin API key configurada' });
  }

  // Rate limit por usuario, apoyado en la propia D1: una fila por usuario con
  // la ventana en curso. Sin esto, un bucle en el cliente vacía la cuenta.
  const limite = await consumirCuota(env, usuario.id);
  if (!limite.ok) return json({ verdict: fallback, degraded: 'límite por minuto alcanzado' });

  try {
    const res = await fetch(llm.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llm.key}`,
      },
      body: JSON.stringify({
        model: llm.modelo,
        // Alto a proposito: los modelos que razonan gastan el presupuesto
        // pensando y truncan la respuesta. Ver server/src/llm.js.
        max_tokens: 2500,
        // Baja a proposito: se piden datos, no prosa.
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(input) },
        ],
      }),
    });
    if (!res.ok) {
      const motivo =
        res.status === 429 ? 'límite de la API alcanzado' : `API ${res.status}`;
      return json({ verdict: fallback, degraded: motivo });
    }

    const data = await res.json();
    const texto = data?.choices?.[0]?.message?.content ?? '';
    const crudo = parseVerdict(texto);
    if (!crudo) return json({ verdict: fallback, degraded: 'respuesta no parseable' });

    return json({
      verdict: {
        reading: String(crudo.reading ?? fallback.reading),
        action: crudo.action ?? fallback.action,
        suggestedWeightKg: crudo.suggestedWeightKg ?? null,
        confidence: crudo.confidence ?? 'media',
        source: 'ai',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    return json({ verdict: fallback, degraded: String(err?.message ?? 'error de la API') });
  }
}

async function consumirCuota(env, userId, max = 20) {
  const ventana = new Date().toISOString().slice(0, 16); // por minuto
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS rate_limit (
       user_id TEXT NOT NULL, window TEXT NOT NULL, hits INTEGER NOT NULL,
       PRIMARY KEY (user_id, window))`,
  ).run();
  const fila = await env.DB.prepare(
    `INSERT INTO rate_limit (user_id, window, hits) VALUES (?1, ?2, 1)
     ON CONFLICT(user_id, window) DO UPDATE SET hits = hits + 1
     RETURNING hits`,
  )
    .bind(userId, ventana)
    .first();
  return { ok: (fila?.hits ?? 1) <= max };
}

// --- router ---------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ruta = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });

    if (ruta === '/api/health') {
      // `coach` le dice al cliente si la capa de IA está configurada. Sin
      // esto la app ofrecería un botón de análisis que siempre falla.
      return json({ ok: true, coach: llmConfig(env) !== null });
    }

    try {
      if (request.method === 'POST' && ruta === '/api/auth/register') return registrar(request, env);
      if (request.method === 'POST' && ruta === '/api/auth/login') return entrar(request, env);

      // De acá para abajo, todo pide sesión.
      const usuario = await requireAuth(request, env);
      if (!usuario) return error('Token inválido o vencido', 401);

      if (request.method === 'GET' && ruta === '/api/auth/me') {
        const user = await env.DB.prepare(
          'SELECT id, email, name, role, gym_id FROM users WHERE id = ?',
        )
          .bind(usuario.id)
          .first();
        return user ? json({ user: { ...user, _id: user.id } }) : error('Usuario inexistente', 404);
      }
      if (request.method === 'PATCH' && ruta === '/api/auth/password') {
        return cambiarPassword(request, env, usuario);
      }
      if (request.method === 'POST' && ruta === '/api/sync') {
        return sincronizar(request, env, usuario);
      }
      if (request.method === 'POST' && ruta === '/api/coach/verdict') {
        return veredicto(request, env, usuario);
      }

      return error('Ruta inexistente', 404);
    } catch (err) {
      console.error(err);
      return error('Error interno', 500);
    }
  },
};
