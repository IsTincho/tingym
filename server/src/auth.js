import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

const DIAS = 60;

export function secret() {
  const s = process.env.JWT_SECRET;
  // Sin secreto no se arranca: un default silencioso seria firmar tokens que
  // cualquiera con el codigo fuente puede falsificar.
  if (!s) throw new Error('Falta JWT_SECRET');
  return s;
}

export function signToken(user) {
  return jwt.sign({ sub: user._id, email: user.email, role: user.role }, secret(), {
    expiresIn: `${DIAS}d`,
  });
}

// El key stretching lo hace el cliente (PBKDF2-SHA256, 210.000 iteraciones) y
// manda el resultado, nunca la contraseña. Ver client/src/db/authKey.js.
//
// Que el servidor sólo aplique SHA-256 con sal propia parece poco, pero lo que
// recibe ya viene estirado: un dump de la base no permite volver a la
// contraseña. La ventaja es que el esquema no depende de la CPU del servidor,
// asi que el mismo hash sirve tal cual si esto corre en un Worker.

export function randomSalt() {
  return randomBytes(16).toString('hex');
}

export function hashAuthKey(authKey, salt) {
  return createHash('sha256').update(`${salt}|${authKey}`).digest('hex');
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Middleware de autenticacion. La sesion es larga a proposito: la app se usa
 * en el gimnasio sin señal, y que el token venza a mitad de un entrenamiento
 * es peor que el riesgo que evita.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta el token' });
  try {
    const payload = jwt.verify(token, secret());
    req.user = { _id: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o vencido' });
  }
}

// Rate limit en memoria, por usuario. Alcanza para una instancia; si algun
// dia hay varias, esto se mueve a Redis o a la propia Mongo.
const hits = new Map();

export function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const key = req.user?._id ?? req.ip;
    const now = Date.now();
    const bucket = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (bucket.length >= max) {
      return res.status(429).json({ error: 'Demasiadas consultas, esperá un momento' });
    }
    bucket.push(now);
    hits.set(key, bucket);
    return next();
  };
}
