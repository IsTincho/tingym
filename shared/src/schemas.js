import { z } from 'zod';
import {
  MUSCLE_GROUPS,
  PATTERNS,
  LOAD_TYPES,
  ROLES,
  COACH_ACTIONS,
} from './constants.js';

// Los ids se generan en el cliente (crypto.randomUUID) para poder crear
// entidades sin red. Mongo acepta _id string, asi que el mismo id viaja
// intacto al servidor y el sync no necesita mapear ids locales a remotos.
export const idSchema = z.string().min(1);

const isoDate = z.string().datetime();

export const exerciseSchema = z.object({
  _id: idSchema,
  ownerId: idSchema.nullable().default(null), // null = catalogo global
  name: z.string().trim().min(1, 'Poné un nombre').max(80),
  muscleGroup: z.enum(MUSCLE_GROUPS),
  pattern: z.enum(PATTERNS),
  loadType: z.enum(LOAD_TYPES),
  notes: z.string().max(500).default(''),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const routineSlotSchema = z
  .object({
    exerciseId: idSchema,
    targetSets: z.number().int().min(1).max(12),
    repRangeMin: z.number().int().min(1).max(100),
    repRangeMax: z.number().int().min(1).max(100),
    restSeconds: z.number().int().min(0).max(600),
    note: z.string().max(300).default(''),
  })
  .refine((s) => s.repRangeMin <= s.repRangeMax, {
    message: 'El piso del rango no puede ser mayor al techo',
    path: ['repRangeMax'],
  });

export const routineDaySchema = z.object({
  key: z.string().min(1).max(8), // 'D1'
  label: z.string().trim().min(1).max(60),
  slots: z.array(routineSlotSchema).default([]),
});

export const routineSchema = z.object({
  _id: idSchema,
  ownerId: idSchema,
  gymId: idSchema.nullable().default(null),
  name: z.string().trim().min(1, 'Poné un nombre').max(80),
  assignedTo: idSchema.nullable().default(null), // trainer -> atleta (V3)
  days: z.array(routineDaySchema).default([]),
  createdAt: isoDate,
  updatedAt: isoDate,
  syncState: z.enum(['local', 'synced']).default('local'),
  clientUpdatedAt: isoDate,
});

export const setSchema = z.object({
  weightKg: z.number().min(0).max(1000).nullable(), // null si bodyweight
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().min(1).max(10).nullable().default(null),
  failed: z.boolean().default(false),
  note: z.string().max(200).default(''),
  loggedAt: isoDate,
});

export const aiVerdictSchema = z.object({
  reading: z.string().min(1),
  action: z.enum(COACH_ACTIONS),
  suggestedWeightKg: z.number().min(0).max(1000).nullable().default(null),
  confidence: z.enum(['alta', 'media', 'baja']),
  source: z.enum(['ai', 'rule']).default('rule'), // 'rule' = fallback determinista
  generatedAt: isoDate,
});

export const sessionEntrySchema = z.object({
  exerciseId: idSchema,
  substitutedFor: idSchema.nullable().default(null),
  // Copia del objetivo del slot al momento de ejecutar: si despues se edita
  // la rutina, el historial sigue contando contra el rango que se entreno.
  target: z
    .object({
      targetSets: z.number().int().min(1).max(12),
      repRangeMin: z.number().int().min(1).max(100),
      repRangeMax: z.number().int().min(1).max(100),
      restSeconds: z.number().int().min(0).max(600),
      note: z.string().max(300).default(''),
    })
    .nullable()
    .default(null),
  sets: z.array(setSchema).default([]),
  aiVerdict: aiVerdictSchema.nullable().default(null),
});

export const sessionSchema = z.object({
  _id: idSchema,
  ownerId: idSchema,
  routineId: idSchema.nullable().default(null),
  dayKey: z.string().max(8).nullable().default(null),
  date: isoDate,
  status: z.enum(['in_progress', 'done']),
  entries: z.array(sessionEntrySchema).default([]),
  syncState: z.enum(['local', 'synced']).default('local'),
  clientUpdatedAt: isoDate,
});

export const bodyweightEntrySchema = z.object({
  _id: idSchema,
  ownerId: idSchema,
  date: isoDate,
  kg: z.number().min(20).max(400),
  syncState: z.enum(['local', 'synced']).default('local'),
  clientUpdatedAt: isoDate,
});

export const userSchema = z.object({
  _id: idSchema,
  email: z.string().email(),
  name: z.string().trim().min(1).max(80),
  role: z.enum(ROLES).default('athlete'),
  gymId: idSchema.nullable().default(null),
});
