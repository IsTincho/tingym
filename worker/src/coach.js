// El prompt y el parseo del veredicto viven acá para que el Worker y el
// servidor Express compartan exactamente el mismo comportamiento.

export const SYSTEM_PROMPT = `Sos el analista de un registro de entrenamiento de gimnasio. Recibís las series que un atleta acaba de hacer en un ejercicio, el rango de repeticiones objetivo y sus últimas sesiones en ese mismo ejercicio. Devolvés una lectura corta y una decisión de carga.

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

export function userPrompt(input) {
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

/**
 * Extrae el JSON aunque el modelo haya agregado algo alrededor. El prompt pide
 * JSON pelado, pero el parseo no puede depender de que siempre obedezca.
 */
export function parseVerdict(text) {
  const limpio = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(limpio);
  } catch {
    const desde = limpio.indexOf('{');
    const hasta = limpio.lastIndexOf('}');
    if (desde === -1 || hasta <= desde) return null;
    try {
      return JSON.parse(limpio.slice(desde, hasta + 1));
    } catch {
      return null;
    }
  }
}

// Resuelve el proveedor de LLM desde el `env` del Worker.
//
// Es el gemelo de server/src/llm.js y esta duplicado a proposito: `shared` es
// codigo puro sin red —eso lo dice el README y es lo que lo hace testeable—, y
// el Worker no tiene process.env, asi que no puede importar el del server.
// Duplicar treinta lineas es mas barato que ensuciar shared con la capa de red.
//
// Groq por defecto: el plan gratis de Gemini da 20 requests por dia. El porque
// completo esta en server/src/llm.js, que es el gemelo de esto.
const PROVEEDORES = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    modelo: 'llama-3.3-70b-versatile',
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modelo: 'gemini-3.6-flash',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    modelo: 'gpt-4o-mini',
  },
  custom: { url: null, modelo: null },
};

export function llmConfig(env) {
  const preset = PROVEEDORES[env.LLM_PROVIDER ?? 'groq'];
  if (!preset) return null;

  const key = env.LLM_API_KEY || env.GROQ_API_KEY || env.GEMINI_API_KEY || env.OPENAI_API_KEY || '';
  if (!key) return null;

  const url = env.LLM_URL || preset.url;
  const modelo = env.LLM_MODEL || preset.modelo;
  if (!url || !modelo) return null;

  return { url, modelo, key };
}
