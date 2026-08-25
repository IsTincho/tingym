import { Router } from 'express';
import { z } from 'zod';
import { aiVerdictSchema, deterministicVerdict, setSchema } from '@gym/shared';
import { requireAuth, rateLimit } from '../auth.js';
import { llmJson } from '../llm.js';

const router = Router();

const body = z.object({
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
    .array(
      z.object({
        date: z.string(),
        sets: z.array(setSchema.partial({ loggedAt: true })),
      }),
    )
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

const SYSTEM = `Sos el analista de un registro de entrenamiento de gimnasio. Recibís las series que un atleta acaba de hacer en un ejercicio, el rango de repeticiones objetivo y sus últimas sesiones en ese mismo ejercicio. Devolvés una lectura corta y una decisión de carga.

Lógica de progresión que tenés que respetar:
- Todas las series en el techo del rango o por encima: subir el peso.
- Se pasó holgadamente del techo (por ejemplo 12 reps con objetivo 6-8): subir, y el salto puede ser doble.
- Empezó dentro del rango y cayó por debajo del piso en las últimas series: mantener el peso hasta sostener todas las series dentro del rango. Eso es fatiga, no exceso de carga.
- Ninguna serie llegó al piso del rango: bajar el peso.
- Todas dentro del rango y parejas: sumar repeticiones antes de tocar el peso.
- Fallo marcado en dos o más series: bajar.

Matices que sí podés aportar por encima de la regla, cuando el contexto los justifique:
- Una primera serie baja seguida de series normales suele ser calentamiento insuficiente o series encadenadas sin descanso, no exceso de peso.
- Un ejercicio hecho al final de la sesión o en un día consecutivo de entrenamiento llega con fatiga acumulada: una caída ahí pesa menos que una caída en el primer ejercicio.
- Una caída abrupta respecto de las sesiones anteriores con el mismo peso apunta a descanso, alimentación o técnica, no a la carga.

Reglas duras:
- No das consejos de nutrición ni suplementación.
- No diagnosticás lesiones ni dolores. Si el atleta menciona molestia articular, dolor o pinchazo, la lectura es que consulte con un profesional y la acción es revisar_tecnica.
- Escribís en español rioplatense, en segunda persona, en una o dos oraciones. Sin emojis.

Respondés EXCLUSIVAMENTE con un objeto JSON, sin markdown, sin backticks y sin texto antes o después, con esta forma exacta:
{"reading": string, "action": "subir"|"mantener"|"bajar"|"sumar_reps"|"revisar_tecnica", "suggestedWeightKg": number|null, "confidence": "alta"|"media"|"baja"}`;

function userPrompt(input) {
  const serie = (s, i) =>
    `  ${i + 1}. ${s.weightKg == null ? 'sin carga' : `${s.weightKg} kg`} × ${s.reps} reps` +
    `${s.rpe ? ` (RPE ${s.rpe})` : ''}${s.failed ? ' [fallo]' : ''}${s.note ? ` — "${s.note}"` : ''}`;

  const historial = input.history.length
    ? input.history
        .map((h) => `- ${h.date}: ${h.sets.map((s) => `${s.weightKg ?? 'BW'}×${s.reps}`).join(', ')}`)
        .join('\n')
    : '- sin sesiones previas registradas';

  return `Ejercicio: ${input.exerciseName} (${input.loadType})
Objetivo: ${input.target.targetSets} series de ${input.target.repRangeMin}-${input.target.repRangeMax} reps${
    input.target.restSeconds ? `, ${input.target.restSeconds}s de descanso` : ''
  }${input.target.note ? `\nNota de la rutina: ${input.target.note}` : ''}

Series de hoy:
${input.sets.map(serie).join('\n')}

Últimas sesiones en este ejercicio:
${historial}

Contexto: ${input.context.exerciseNumber ? `ejercicio número ${input.context.exerciseNumber} de la sesión` : 'posición en la sesión desconocida'}${
    input.context.consecutiveDay ? ', segundo día consecutivo de entrenamiento' : ''
  }${input.context.userNote ? `\nEl atleta anotó: "${input.context.userNote}"` : ''}`;
}

router.post('/verdict', requireAuth, rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const input = parsed.data;

  // El fallback se calcula SIEMPRE y primero: si la IA falla, se agota el
  // rate limit o el modelo devuelve cualquier cosa, igual hay veredicto.
  const fallback = deterministicVerdict({
    sets: input.sets,
    target: input.target,
    loadType: input.loadType,
  });

  const { ok, data, motivo } = await llmJson({
    system: SYSTEM,
    user: userPrompt(input),
    maxTokens: 400,
  });
  if (!ok) return res.json({ verdict: fallback, degraded: motivo });

  const veredicto = aiVerdictSchema.safeParse({
    ...data,
    suggestedWeightKg: data.suggestedWeightKg ?? null,
    source: 'ai',
    generatedAt: new Date().toISOString(),
  });
  if (!veredicto.success) {
    return res.json({ verdict: fallback, degraded: 'respuesta fuera de esquema' });
  }
  return res.json({ verdict: veredicto.data });
});

export default router;
