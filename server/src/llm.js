// Capa de LLM. Existe para que cambiar de proveedor sea una variable de
// entorno y no una reescritura: este proyecto ya cambio de proveedor una vez
// (Anthropic -> Groq) y la segunda vez no tiene que doler.
//
// No usa el SDK de nadie. Groq, Gemini, OpenRouter, Together y Ollama hablan
// todos el mismo formato (`/chat/completions` de OpenAI), asi que un `fetch`
// alcanza y no hay una dependencia mas que actualizar. Cambiar de proveedor es
// cambiar una URL y un nombre de modelo.
//
// Por que Groq por defecto: es gratis sin tarjeta y —lo que decide— NO entrena
// con lo que le mandas, ni en el plan gratis. El free tier de Gemini si lo
// permite en sus terminos. Por acá viaja lo que come y entrena una persona;
// gratis son los dos, pero uno se lo queda.

const PROVEEDORES = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    // 30 req/min y 1.000 por dia en el plan gratis. Para un usuario que anota
    // unas diez series y tres comidas por dia, sobra por dos ordenes.
    modelo: 'llama-3.3-70b-versatile',
  },
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    // 15 req/min y 1.500 por dia. Ojo: los terminos del plan gratis permiten
    // que Google entrene con los prompts.
    modelo: 'gemini-2.5-flash',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    modelo: 'gpt-4o-mini',
  },
  // Cualquier otro compatible (OpenRouter, Together, un Ollama local). Con
  // este hay que dar LLM_URL y LLM_MODEL a mano.
  custom: { url: null, modelo: null },
};

/**
 * Resuelve el proveedor desde el entorno. Devuelve null si no hay key, que es
 * el modo degradado: la app funciona igual, sin la capa de IA.
 */
export function llmConfig() {
  const nombre = process.env.LLM_PROVIDER ?? 'groq';
  const preset = PROVEEDORES[nombre];
  if (!preset) return null;

  // LLM_API_KEY es la forma canonica. Se aceptan tambien las especificas
  // porque es el nombre que usa la documentacion de cada proveedor y es lo
  // primero que uno pega en Railway sin pensar.
  const key =
    process.env.LLM_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';
  if (!key) return null;

  const url = process.env.LLM_URL || preset.url;
  const modelo = process.env.LLM_MODEL || preset.modelo;
  if (!url || !modelo) return null;

  return { nombre, url, modelo, key };
}

export function llmConfigurado() {
  return llmConfig() !== null;
}

/**
 * Extrae el JSON aunque el modelo haya agregado algo alrededor.
 *
 * Los prompts piden JSON pelado, pero el parseo no puede depender de que
 * siempre obedezcan —y los modelos abiertos obedecen menos que Claude, asi
 * que esto importa mas que antes. Devuelve null si no hay nada rescatable.
 */
export function extraerJson(texto) {
  const limpio = String(texto ?? '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
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

/**
 * Pide una respuesta JSON al modelo.
 *
 * Devuelve `{ ok: true, data }` o `{ ok: false, motivo }`. Nunca tira: todos
 * los que llaman tienen que poder degradar, asi que un fallo del proveedor es
 * un valor de retorno y no una excepcion que haya que acordarse de atrapar.
 *
 * El timeout no es opcional. Sin el, una llamada colgada deja al usuario
 * mirando un boton en "Estimando..." para siempre, y en el gimnasio la senal
 * se corta a la mitad todo el tiempo.
 */
export async function llmJson({ system, user, maxTokens = 400, timeoutMs = 20_000 }) {
  const cfg = llmConfig();
  if (!cfg) return { ok: false, motivo: 'sin API key configurada' };

  const abort = new AbortController();
  const reloj = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({
        model: cfg.modelo,
        max_tokens: maxTokens,
        // Baja a proposito: se piden datos, no prosa. Con temperatura alta el
        // mismo texto de comida da numeros distintos cada vez, y eso en un
        // diario se nota y molesta.
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      // El 429 se distingue porque es el unico que se arregla esperando, y el
      // que va a aparecer si algun dia esto crece mas alla de un usuario.
      const motivo =
        res.status === 429
          ? 'limite de la API alcanzado, probá en un minuto'
          : `la API respondió ${res.status}`;
      return { ok: false, motivo, detalle: detalle.slice(0, 200) };
    }

    const cuerpo = await res.json();
    const texto = cuerpo?.choices?.[0]?.message?.content ?? '';
    const data = extraerJson(texto);
    if (!data) return { ok: false, motivo: 'respuesta no parseable' };
    return { ok: true, data };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, motivo: 'la API tardó demasiado' };
    return { ok: false, motivo: err?.message ?? 'error de la API' };
  } finally {
    clearTimeout(reloj);
  }
}
