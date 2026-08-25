import { Router } from 'express';
import { z } from 'zod';
import { mealEstimateSchema } from '@gym/shared';
import { requireAuth, rateLimit } from '../auth.js';
import { llmJson } from '../llm.js';

const router = Router();

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

  const clave = claveDe(description);
  const cacheada = cacheGet(clave);
  if (cacheada) return res.json({ estimate: cacheada, cached: true });

  const { ok, data, motivo } = await llmJson({
    system: SYSTEM,
    user: description,
    // La respuesta son ~22 tokens; 200 da aire de sobra. La holgura para que
    // el modelo piense la agrega llm.js segun el proveedor: acá no se sabe ni
    // hace falta saber cuál está configurado.
    maxTokens: 200,
  });
  // Sin key, sin señal o con el límite agotado no hay estimación posible, y se
  // dice claro. La app ya sabe anotar a mano: ese es el modo degradado, y es
  // el mismo que tiene hoy.
  if (!ok) return res.json({ estimate: VACIA, degraded: motivo });

  const estimacion = mealEstimateSchema.safeParse({
    kcal: data.kcal ?? null,
    proteinG: data.proteinG ?? null,
    confidence: data.confidence ?? 'baja',
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
});

export default router;
