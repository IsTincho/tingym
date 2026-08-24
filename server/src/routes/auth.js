import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { newId } from '@gym/shared';
import { db } from '../db.js';
import { requireAuth, signToken } from '../auth.js';

const router = Router();

const credentials = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
  name: z.string().trim().min(1).max(80).optional(),
  // El cliente ya venia generando datos offline bajo un id local. Si lo
  // manda, el servidor lo adopta como _id del usuario y todo lo que ya
  // existia en el telefono queda atribuido sin migracion.
  localUserId: z.string().min(1).optional(),
});

router.post('/register', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { email, password, name, localUserId } = parsed.data;

  const existing = await db().collection('users').findOne({ email });
  if (existing) return res.status(409).json({ error: 'Ese email ya está registrado' });

  const user = {
    _id: localUserId ?? newId(),
    email,
    passwordHash: await bcrypt.hash(password, 12),
    name: name ?? email.split('@')[0],
    role: 'athlete',
    gymId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await db().collection('users').insertOne(user);
  } catch (err) {
    // Choque de _id: el id local ya lo usa otra cuenta. Se reintenta con uno
    // nuevo antes de fallar, porque el usuario no puede hacer nada al respecto.
    if (err?.code === 11000) {
      user._id = newId();
      await db().collection('users').insertOne(user);
    } else {
      throw err;
    }
  }

  return res.status(201).json({
    token: signToken(user),
    user: { _id: user._id, email: user.email, name: user.name, role: user.role },
  });
});

router.post('/login', async (req, res) => {
  const parsed = credentials.pick({ email: true, password: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos inválidos' });

  const user = await db().collection('users').findOne({ email: parsed.data.email });
  // Mismo mensaje para email inexistente y contraseña incorrecta: distinguirlos
  // convierte el login en un verificador de qué emails están registrados.
  const ok = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Email o contraseña incorrectos' });

  return res.json({
    token: signToken(user),
    user: { _id: user._id, email: user.email, name: user.name, role: user.role },
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await db()
    .collection('users')
    .findOne({ _id: req.user._id }, { projection: { passwordHash: 0 } });
  if (!user) return res.status(404).json({ error: 'Usuario inexistente' });
  return res.json({ user });
});

const passwordChange = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'La nueva contraseña necesita al menos 8 caracteres'),
});

router.patch('/password', requireAuth, async (req, res) => {
  const parsed = passwordChange.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const user = await db().collection('users').findOne({ _id: req.user._id });
  if (!user) return res.status(404).json({ error: 'Usuario inexistente' });

  // Se pide la actual aunque el token ya autentique: un token robado no
  // alcanza para quedarse con la cuenta cambiandole la contraseña.
  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'La contraseña actual no coincide' });

  await db()
    .collection('users')
    .updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: await bcrypt.hash(parsed.data.newPassword, 12),
          updatedAt: new Date().toISOString(),
        },
      },
    );

  // Token nuevo: el anterior sigue siendo valido hasta que venza, pero el
  // cliente se queda con el recien emitido.
  return res.json({ token: signToken({ ...user, role: user.role }) });
});

export default router;
