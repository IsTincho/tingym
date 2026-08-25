import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { mealEstimateSchema } from '@gym/shared';
import { requireAuth, rateLimit } from '../auth.js';

const router = Router();

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

const body = z.object({
  description: z.string().trim().min(1).max(300),
});

// Cache por texto normalizado. "Pollo con arroz" se va a escribir cincuenta
// veces y no tiene sentido pagar cincuenta llamadas por la misma respuesta.
//
// En memoria y no en Mongo a proposito: es un acelerador, no un dato. Si el
// proceso se reinicia se pierde y no pasa nada. Meterlo en la base sumaria una
// coleccion, una migracion y un problema de invalidacion para ahorrar
// centavos.
//
// El techo existe porque el server es de una sola instancia chica: sin limite,
// un usuario que anota mucho lo llena de strings. Al llegar al tope se tira la
// entrada mas vieja, que en un Map de JS es la primera que devuelve keys().
const CACHE_MAX = 500;
const cache = new Map();

// Normalizar de mas es peor que de menos: "200 g de pollo" y "300 g de pollo"
// tienen que seguir siendo claves distintas. Solo se aplana lo que no cambia
// el contenido —mayusculas, espacios de mas, tildes y puntuacion de borde.
function claveDe(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cacheGet(clave) {
  if (!cache.has(clave)) return null;
  // Re-insertar lo mueve al final: lo que se usa sobrevive a lo que no.
  const valor = cache.get(clave);
  cache.delete(clave);
  cache.set(clave, valor);
  return valor;
}

function cacheSet(clave, valor) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(clave, valor);
}

const SYSTEM = `Sos el estimador de un diario de comidas de una app de entrenamiento, en Argentina. Recibís lo que una persona anotó que comió, en español rioplatense, y devolvés una estimación de calorías totales y proteína total de esa comida.

Cómo estimar:
- El texto viene en argentino y con nombres locales: milanesa, ñoquis, facturas, mate cocido, dulce de leche, provoleta, choripán, alfajor, yerba. Interpretalos como los interpretaría alguien de acá.
- Si hay cantidad explícita ("200 g de pollo", "dos huevos", "un plato de fideos"), usala.
- Si no hay cantidad, asumí una porción típica de adulto y bajá la confianza.
- Las estimaciones son de la comida entera que se describe, no por cada ingrediente.
- Redondeá: las calorías al múltiplo de 10 más cercano, la proteína al gramo. Un número con decimales finge una precisión que no existe.

Cuándo devolver null:
- El texto no describe comida ("comí bien", "lo de siempre", "asado con la familia" sin decir qué comió).
- No podés identificar de qué se trata.
Devolver null en los dos números es una respuesta correcta y esperada. Inventar un número es peor que no dar ninguno.

Confianza:
- alta: cantidades explícitas y alimentos claros.
- media: alimentos claros pero sin cantidad, o porciones asumidas.
- baja: descripción vaga, ambigua o parcialmente identificable.

Reglas duras:
- NO das consejos de nutrición. No decís si está bien o mal, si es mucho o poco, ni sugerís cambios. Sos una calculadora, no un nutricionista.
- No agregás comentarios, advertencias ni texto de ningún tipo.

Respondés EXCLUSIVAMENTE con un objeto JSON, sin markdown, sin backticks y sin texto antes o después, con esta forma exacta:
{"kcal": number|null, "proteinG": number|null, "confidence": "alta"|"media"|"baja"}`;

/**
 * Extrae el JSON aunque el modelo haya agregado algo alrededor. Mismo criterio
 * que en coach.js: el prompt pide JSON pelado, pero el parseo no puede
 * depender de que siempre obedezca.
 */
function parseEstimacion(text) {
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

const VACIA = { kcal: null, proteinG: null, confidence: 'baja' };

// El limite es mas alto que el del coach porque anotar cuatro comidas de un
// tiron es normal, y cada una es una llamada. La cache se come casi todas las
// repeticiones, asi que el techo real se toca solo escribiendo cosas nuevas.
router.post('/parse', requireAuth, rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { description } = parsed.data;

  // Sin key no hay estimacion posible y se dice claro. La app ya sabe anotar a
  // mano: eso es el modo degradado, y es el mismo que tiene hoy.
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ estimate: VACIA, degraded: 'sin API key configurada' });
  }

  const clave = claveDe(description);
  const cacheada = cacheGet(clave);
  if (cacheada) return res.json({ estimate: cacheada, cached: true });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const respuesta = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: description }],
    });

    const texto = respuesta.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const crudo = parseEstimacion(texto);
    if (!crudo) return res.json({ estimate: VACIA, degraded: 'respuesta no parseable' });

    const estimacion = mealEstimateSchema.safeParse({
      kcal: crudo.kcal ?? null,
      proteinG: crudo.proteinG ?? null,
      confidence: crudo.confidence ?? 'baja',
    });
    if (!estimacion.success) {
      return res.json({ estimate: VACIA, degraded: 'respuesta fuera de esquema' });
    }

    // Solo se cachea lo que sirve. Cachear una estimacion vacia condenaria a
    // ese texto a no estimarse nunca mas, aun si el fallo fue pasajero.
    if (estimacion.data.kcal != null || estimacion.data.proteinG != null) {
      cacheSet(clave, estimacion.data);
    }
    return res.json({ estimate: estimacion.data });
  } catch (err) {
    return res.json({ estimate: VACIA, degraded: err?.message ?? 'error de la API' });
  }
});

export default router;
