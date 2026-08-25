import { Router } from 'express';
import { z } from 'zod';
import { newId } from '@gym/shared';
import { db } from '../db.js';
import { hashAuthKey, randomSalt, requireAuth, safeEqual, signToken } from '../auth.js';

const router = Router();

const credenciales = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  // No es la contraseña: es PBKDF2(contraseña) hecho en el cliente. Ver auth.js.
  authKey: z.string().regex(/^[0-9a-f]{64}$/, 'authKey inválida'),
  name: z.string().trim().min(1).max(80).optional(),
  // El cliente ya venia generando datos offline bajo un id local. Si lo
  // manda, el servidor lo adopta como _id del usuario y todo lo que ya
  // existia en el telefono queda atribuido sin migracion.
  localUserId: z.string().min(1).max(64).optional(),
});

const publico = (user) => ({
  _id: user._id,
  email: user.email,
  name: user.name,
  role: user.role,
});

router.post('/register', async (req, res) => {
  const parsed = credenciales.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, authKey, name, localUserId } = parsed.data;

  const existente = await db().collection('users').findOne({ email });
  if (existente) return res.status(409).json({ error: 'Ese email ya está registrado' });

  const salt = randomSalt();
  const ahora = new Date().toISOString();
  const user = {
    _id: localUserId ?? newId(),
    email,
    passHash: hashAuthKey(authKey, salt),
    salt,
    name: name ?? email.split('@')[0],
    role: 'athlete',
    gymId: null,
    createdAt: ahora,
    updatedAt: ahora,
  };

  try {
    await db().collection('users').insertOne(user);
  } catch (err) {
    // Choque de _id: el id local ya lo usa otra cuenta. Se reintenta con uno
    // nuevo antes de fallar, porque el usuario no puede hacer nada al respecto.
    if (err?.code !== 11000) throw err;
    user._id = newId();
    await db().collection('users').insertOne(user);
  }

  return res.status(201).json({ token: signToken(user), user: publico(user) });
});

router.post('/login', async (req, res) => {
  const parsed = credenciales.pick({ email: true, authKey: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const user = await db().collection('users').findOne({ email: parsed.data.email });
  // Mismo mensaje para email inexistente y contraseña incorrecta: distinguirlos
  // convierte el login en un verificador de qué emails están registrados.
  if (!user) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  if (!safeEqual(hashAuthKey(parsed.data.authKey, user.salt), user.passHash)) {
    return res.status(401).json({ error: 'Email o contraseña incorrectos' });
  }

  return res.json({ token: signToken(user), user: publico(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await db()
    .collection('users')
    .findOne({ _id: req.user._id }, { projection: { passHash: 0, salt: 0 } });
  if (!user) return res.status(404).json({ error: 'Usuario inexistente' });
  return res.json({ user });
});

router.patch('/password', requireAuth, async (req, res) => {
  const parsed = z
    .object({
      currentAuthKey: z.string().regex(/^[0-9a-f]{64}$/),
      newAuthKey: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const user = await db().collection('users').findOne({ _id: req.user._id });
  if (!user) return res.status(404).json({ error: 'Usuario inexistente' });

  // Se pide la actual aunque el token ya autentique: un token robado no
  // alcanza para quedarse con la cuenta cambiandole la contraseña.
  if (!safeEqual(hashAuthKey(parsed.data.currentAuthKey, user.salt), user.passHash)) {
    return res.status(401).json({ error: 'La contraseña actual no coincide' });
  }

  const salt = randomSalt();
  await db()
    .collection('users')
    .updateOne(
      { _id: user._id },
      {
        $set: {
          passHash: hashAuthKey(parsed.data.newAuthKey, salt),
          salt,
          updatedAt: new Date().toISOString(),
        },
      },
    );

  return res.json({ token: signToken(user) });
});

export default router;
