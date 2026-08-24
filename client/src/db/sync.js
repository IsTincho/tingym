import { db, getMeta, setMeta } from './db.js';
import { getCurrentUserId } from './repo.js';

const API = import.meta.env.VITE_API_URL ?? '';

// Colecciones que viajan. El orden no importa: el servidor las procesa todas
// en la misma llamada.
const COLLECTIONS = ['exercises', 'routines', 'sessions', 'bodyweight', 'meals'];

export async function getToken() {
  return getMeta('authToken');
}

export async function setSession({ token, user }) {
  await setMeta('authToken', token);
  await setMeta('currentUserId', user._id);
  await setMeta('userEmail', user.email);
}

export async function clearSession() {
  await setMeta('authToken', null);
}

async function call(path, { method = 'POST', body, auth = true } = {}) {
  const token = auth ? await getToken() : null;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

export async function register({ email, password, name }) {
  // Se manda el id local para que el servidor adopte todo lo que ya se
  // registro offline antes de crear la cuenta.
  const localUserId = await getCurrentUserId();
  const data = await call('/api/auth/register', {
    body: { email, password, name, localUserId },
    auth: false,
  });
  await setSession(data);
  return data.user;
}

export async function login({ email, password }) {
  const data = await call('/api/auth/login', { body: { email, password }, auth: false });
  const previo = await getCurrentUserId();
  await setSession(data);
  // Entrar con otra cuenta en el mismo telefono: lo local es de otro dueño y
  // no puede quedar mezclado con lo que baje del servidor.
  if (previo !== data.user._id) await wipeLocalData();
  return data.user;
}

export async function changePassword({ currentPassword, newPassword }) {
  const data = await call('/api/auth/password', {
    method: 'PATCH',
    body: { currentPassword, newPassword },
  });
  await setMeta('authToken', data.token);
  return true;
}

async function wipeLocalData() {
  await Promise.all(COLLECTIONS.map((c) => db[c].clear()));
  await setMeta('lastSyncAt', null);
  await setMeta('seededExercises', null);
}

/** Documentos con cambios locales sin confirmar por el servidor. */
async function pendingChanges() {
  const changes = {};
  for (const name of COLLECTIONS) {
    const docs = await db[name].toArray();
    changes[name] = docs
      .filter((d) => d.syncState !== 'synced')
      // exerciseIds es un indice local; el servidor valida con Zod y lo
      // rechazaria como campo desconocido si viajara.
      .map(({ exerciseIds, ...rest }) => rest);
  }
  return changes;
}

/**
 * Sync oportunista. Nunca se espera desde la UI: si no hay red o no hay
 * sesion, devuelve por que no se hizo y la app sigue andando igual.
 */
export async function sync({ force = false } = {}) {
  if (!API) return { skipped: 'sin API configurada' };
  if (!navigator.onLine && !force) return { skipped: 'sin conexión' };
  const token = await getToken();
  if (!token) return { skipped: 'sin sesión' };

  const since = await getMeta('lastSyncAt');
  const changes = await pendingChanges();

  const data = await call('/api/sync', { body: { since, changes } });

  // Lo que el servidor acepto queda marcado como sincronizado; lo que bajo se
  // escribe tal cual, tambien como sincronizado.
  await db.transaction('rw', COLLECTIONS.map((c) => db[c]), async () => {
    for (const name of COLLECTIONS) {
      const enviados = changes[name] ?? [];
      const rechazados = new Set(
        (data.rejected ?? []).filter((r) => r.collection === name).map((r) => r._id),
      );
      for (const doc of enviados) {
        if (rechazados.has(doc._id)) continue;
        await db[name].update(doc._id, { syncState: 'synced' });
      }

      for (const doc of data.changes?.[name] ?? []) {
        const local = await db[name].get(doc._id);
        // El servidor puede devolver algo que en este dispositivo se edito
        // despues del push: en ese caso lo local es mas nuevo y no se pisa.
        if (local && local.clientUpdatedAt > (doc.clientUpdatedAt ?? '')) continue;
        const fila =
          name === 'sessions'
            ? {
                ...doc,
                exerciseIds: [
                  ...new Set(
                    (doc.entries ?? []).flatMap((e) =>
                      [e.exerciseId, e.substitutedFor].filter(Boolean),
                    ),
                  ),
                ],
              }
            : doc;
        await db[name].put({ ...fila, syncState: 'synced' });
      }
    }
  });

  await setMeta('lastSyncAt', data.serverTime);
  return { ok: true, applied: data.applied, rejected: data.rejected };
}

/**
 * Dispara sync cuando vuelve la conexion y cada pocos minutos. Todo en
 * background: ningun error de red llega a la UI.
 */
export function startBackgroundSync({ everyMs = 5 * 60_000 } = {}) {
  const intentar = () => {
    sync().catch(() => {});
  };
  intentar();
  const timer = setInterval(intentar, everyMs);
  window.addEventListener('online', intentar);
  return () => {
    clearInterval(timer);
    window.removeEventListener('online', intentar);
  };
}

// --- coach (V2) -----------------------------------------------------------

/**
 * ¿Hay capa de IA disponible? Se consulta una vez por sesion de app y se
 * cachea: sin API key configurada en el servidor, la UI ni siquiera ofrece el
 * analisis, porque el veredicto de la regla local ya esta en pantalla.
 */
let coachDisponible = null;

export async function isCoachEnabled() {
  if (coachDisponible !== null) return coachDisponible;
  if (!API || !navigator.onLine) return false;
  try {
    const res = await fetch(`${API}/api/health`);
    const data = await res.json();
    coachDisponible = Boolean(data.coach);
  } catch {
    coachDisponible = false;
  }
  return coachDisponible;
}

/**
 * Pide el veredicto de la IA. El llamador siempre tiene el veredicto
 * determinista a mano, asi que un fallo acá no rompe nada: devuelve null.
 */
export async function requestVerdict(payload) {
  if (!API) return null;
  if (!navigator.onLine) return null;
  try {
    const data = await call('/api/coach/verdict', { body: payload });
    return data.verdict ?? null;
  } catch {
    return null;
  }
}
