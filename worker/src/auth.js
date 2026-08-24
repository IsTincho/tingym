// Autenticación pensada para el límite de CPU de Workers en el plan gratuito
// (10 ms por request).
//
// bcrypt con coste 12 tarda cientos de milisegundos: en un Worker gratis, el
// login se cortaría siempre. La solución es mover el key stretching al
// cliente: el navegador deriva PBKDF2-SHA256 con 210.000 iteraciones (tiene
// todo el tiempo del mundo) y manda el resultado. El servidor sólo le aplica
// un SHA-256 con sal propia, que cuesta microsegundos.
//
// La contraseña en limpio nunca sale del dispositivo, y un dump de la base no
// alcanza para recuperarla: lo guardado es el hash de un valor ya estirado.

const enc = new TextEncoder();

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSalt() {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashAuthKey(authKey, salt) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}|${authKey}`));
  return hex(digest);
}

/** Comparación en tiempo constante: no filtra cuántos caracteres coinciden. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i += 1) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

// --- JWT (HS256 sobre Web Crypto, sin dependencias) -----------------------

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const b64urlDecode = (s) => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function key(secret) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

const DIAS = 60;

export async function signToken(user, secret) {
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(
    enc.encode(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        role: user.role,
        // Sesión larga a propósito: un token que vence a mitad del
        // entrenamiento es peor que el riesgo que evita.
        exp: Math.floor(Date.now() / 1000) + DIAS * 86400,
      }),
    ),
  );
  const firma = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(firma)}`;
}

export async function verifyToken(token, secret) {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [header, payload, firma] = partes;
  const ok = await crypto.subtle.verify(
    'HMAC',
    await key(secret),
    b64urlDecode(firma),
    enc.encode(`${header}.${payload}`),
  );
  if (!ok) return null;
  try {
    const datos = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (datos.exp && datos.exp < Math.floor(Date.now() / 1000)) return null;
    return datos;
  } catch {
    return null;
  }
}

export async function requireAuth(request, env) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const payload = await verifyToken(token, env.JWT_SECRET);
  return payload ? { id: payload.sub, email: payload.email, role: payload.role } : null;
}
