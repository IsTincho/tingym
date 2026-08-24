import { Router } from 'express';
import { z } from 'zod';
import {
  bodyweightEntrySchema,
  exerciseSchema,
  mealSchema,
  routineSchema,
  sessionSchema,
} from '@gym/shared';
import { db } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// Que colecciones viajan y con que esquema se valida cada una. El servidor no
// confia en lo que manda el cliente: valida con el mismo Zod compartido.
const COLLECTIONS = {
  exercises: exerciseSchema,
  routines: routineSchema,
  sessions: sessionSchema,
  bodyweight: bodyweightEntrySchema,
  meals: mealSchema,
};

const pushBody = z.object({
  since: z.string().datetime().nullable().optional(),
  changes: z.record(z.string(), z.array(z.unknown())).default({}),
});

/**
 * Sync en una sola llamada: el cliente empuja lo que tiene local y recibe todo
 * lo que cambio en el servidor desde `since`.
 *
 * El conflicto se resuelve por last-write-wins sobre clientUpdatedAt, que es
 * lo que corresponde con un solo usuario editando sus propias sesiones: dos
 * dispositivos del mismo dueño, y gana el ultimo que escribio. No hay CRDTs
 * porque no hay edicion concurrente real.
 */
router.post('/', requireAuth, async (req, res) => {
  const parsed = pushBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Payload inválido' });

  const ownerId = req.user._id;
  const { since, changes } = parsed.data;
  const serverNow = new Date().toISOString();
  const applied = {};
  const rejected = [];

  for (const [name, schema] of Object.entries(COLLECTIONS)) {
    const docs = changes[name] ?? [];
    if (docs.length === 0) {
      applied[name] = 0;
      continue;
    }

    const ops = [];
    for (const raw of docs) {
      const check = schema.safeParse(raw);
      if (!check.success) {
        rejected.push({ collection: name, _id: raw?._id, error: check.error.issues[0].message });
        continue;
      }
      const doc = check.data;

      // El ownerId del token manda siempre: sin esto, un cliente podria
      // escribir documentos dentro de la cuenta de otro.
      if (name !== 'exercises' || doc.ownerId != null) doc.ownerId = ownerId;

      ops.push({
        updateOne: {
          filter: {
            _id: doc._id,
            // La condicion es el corazon del last-write-wins: solo pisa si lo
            // que llega es mas nuevo que lo guardado.
            $or: [
              { clientUpdatedAt: { $exists: false } },
              { clientUpdatedAt: { $lte: doc.clientUpdatedAt ?? doc.updatedAt } },
            ],
          },
          update: { $set: { ...doc, ownerId, updatedAt: serverNow } },
          upsert: true,
        },
      });
    }

    if (ops.length > 0) {
      try {
        const r = await db().collection(name).bulkWrite(ops, { ordered: false });
        applied[name] = r.upsertedCount + r.modifiedCount;
      } catch (err) {
        // Un upsert que choca contra un documento mas nuevo tira duplicate key:
        // no es un error, es el LWW funcionando. Se cuenta lo que sí entró.
        if (err?.code === 11000 || err?.writeErrors) {
          applied[name] = err.result?.nUpserted ?? 0;
        } else {
          throw err;
        }
      }
    } else {
      applied[name] = 0;
    }
  }

  // Pull: todo lo del usuario tocado despues de `since`.
  const pulled = {};
  const filtro = since ? { updatedAt: { $gt: since } } : {};
  for (const name of Object.keys(COLLECTIONS)) {
    const query =
      name === 'exercises'
        ? { ...filtro, $or: [{ ownerId }, { ownerId: null }] }
        : { ...filtro, ownerId };
    pulled[name] = await db().collection(name).find(query).limit(2000).toArray();
  }

  return res.json({ serverTime: serverNow, applied, rejected, changes: pulled });
});

export default router;
