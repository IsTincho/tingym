import { LOAD_TYPES_WITHOUT_WEIGHT } from './constants.js';
import { nowIso } from './id.js';

// Motor determinista de progresion.
//
// Es el fallback del que habla la seccion 6 del documento: funciones puras,
// sin red, que cubren la decision base. La capa de IA (V2) agrega el matiz
// —fatiga acumulada, ejercicios encadenados, tecnica— pero nunca es la unica
// fuente del veredicto, porque en el subsuelo del gimnasio no hay senal.

// Salto de carga segun el tipo de implemento: una barra sube de a 2.5 kg
// (discos de 1.25 por lado), las mancuernas del gimnasio saltan de a 2, y
// maquinas y poleas tienen placas mas gruesas.
const STEP_BY_LOAD_TYPE = {
  barbell: 2.5,
  dumbbell: 2,
  cable: 2.5,
  machine: 5,
  bodyweight: 0,
  time: 0,
};

export function weightStep(loadType, weightKg) {
  const step = STEP_BY_LOAD_TYPE[loadType] ?? 2.5;
  // Con cargas chicas un salto fijo es un salto porcentual enorme: pasar de
  // 10 a 15 kg en una polea es +50%. Debajo de 20 kg se usa medio paso.
  if (weightKg != null && weightKg < 20 && step > 2) return step / 2;
  return step;
}

function workingSets(sets) {
  // Una serie sin reps es un input a medio llenar, no un dato.
  return (sets ?? []).filter((s) => s && Number(s.reps) > 0);
}

export function topWeight(sets) {
  const list = workingSets(sets).filter((s) => s.weightKg != null);
  if (list.length === 0) return null;
  return Math.max(...list.map((s) => Number(s.weightKg)));
}

export function totalVolume(sets) {
  return workingSets(sets).reduce(
    (acc, s) => acc + Number(s.reps) * Number(s.weightKg ?? 0),
    0,
  );
}

// Epley. No se expone en la UI de V1 (el anti-alcance descarta el 1RM
// estimado), pero sirve internamente para comparar series de distinto peso
// y reps al detectar estancamiento.
export function estimated1rm(weightKg, reps) {
  if (weightKg == null || !reps) return null;
  return weightKg * (1 + reps / 30);
}

function verdict(reading, action, { suggestedWeightKg = null, confidence = 'media' } = {}) {
  return {
    reading,
    action,
    suggestedWeightKg,
    confidence,
    source: 'rule',
    generatedAt: nowIso(),
  };
}

/**
 * Veredicto determinista para el ejercicio recien terminado.
 *
 * @param {object} input
 * @param {Array} input.sets       series registradas hoy
 * @param {object} input.target    { targetSets, repRangeMin, repRangeMax }
 * @param {string} input.loadType  tipo de carga del ejercicio
 * @returns {object} veredicto con la misma forma que el de la IA (source 'rule')
 */
export function deterministicVerdict({ sets, target, loadType = 'barbell' }) {
  const list = workingSets(sets);
  if (list.length === 0) {
    return verdict('Todavía no registraste series.', 'mantener', { confidence: 'baja' });
  }
  if (!target) {
    return verdict(
      'Este ejercicio no tiene rango objetivo, así que no hay contra qué comparar.',
      'mantener',
      { confidence: 'baja' },
    );
  }

  const { repRangeMin: min, repRangeMax: max, targetSets } = target;
  const reps = list.map((s) => Number(s.reps));
  const first = reps[0];
  const last = reps[reps.length - 1];
  const weight = topWeight(list);
  const bodyweightish = LOAD_TYPES_WITHOUT_WEIGHT.includes(loadType);
  const step = weightStep(loadType, weight);
  const failedCount = list.filter((s) => s.failed).length;
  const completedAllSets = targetSets == null || list.length >= targetSets;

  const allAtCeiling = reps.every((r) => r >= max);
  const allBelowFloor = reps.every((r) => r < min);
  const drop = first - last;

  // 1. Fallo repetido: el problema no es el rango, es que la serie se corta.
  if (failedCount >= 2) {
    return verdict(
      `Marcaste fallo en ${failedCount} series. Eso es carga de más, no intensidad.`,
      'bajar',
      {
        suggestedWeightKg: bodyweightish || weight == null ? null : Math.max(0, weight - step * 2),
        confidence: 'alta',
      },
    );
  }

  // 2. Techo del rango en todas las series -> subir.
  //    Es el caso "12 reps con objetivo de 6-8" y el de "llegaste al techo en
  //    las 4 series" del documento.
  if (allAtCeiling && completedAllSets) {
    const holgura = Math.min(...reps) - max;
    // Pasarse largo del techo (12 con objetivo 6-8) justifica salto doble.
    const salto = holgura >= Math.max(2, Math.round((max - min) / 2) + 1) ? step * 2 : step;
    if (bodyweightish) {
      return verdict(
        `Cerraste todas las series en el techo del rango (${max}). Sin carga externa, el próximo paso es una variante más difícil.`,
        'revisar_tecnica',
        { confidence: 'media' },
      );
    }
    return verdict(
      holgura > 0
        ? `Te pasaste del techo del rango en todas las series: el peso está liviano.`
        : `Llegaste al techo del rango en las ${list.length} series.`,
      'subir',
      {
        suggestedWeightKg: weight == null ? null : weight + salto,
        confidence: 'alta',
      },
    );
  }

  // 3. Techo en todas pero faltaron series: el dato esta incompleto.
  if (allAtCeiling && !completedAllSets) {
    return verdict(
      `Vas al techo del rango pero te faltan series. Terminá el ejercicio antes de subir.`,
      'mantener',
      { confidence: 'media' },
    );
  }

  // 4. Todo por debajo del piso -> el peso te gano de entrada.
  if (allBelowFloor) {
    return verdict(
      `Ninguna serie llegó al piso del rango (${min}). El peso está pesado.`,
      'bajar',
      {
        suggestedWeightKg: bodyweightish || weight == null ? null : Math.max(0, weight - step),
        confidence: 'alta',
      },
    );
  }

  // 5. Empezaste dentro del rango y caiste por debajo: es fatiga dentro de la
  //    serie, no exceso de carga. Sostener el peso hasta aguantarlo entero.
  if (first >= min && last < min) {
    return verdict(
      `Arrancaste en ${first} y caíste a ${last}: el peso te está ganando sobre el final. Mantené hasta sostener las ${list.length} series dentro del rango.`,
      'mantener',
      { confidence: 'alta' },
    );
  }

  // 6. Cruzaste el rango entero de punta a punta (10 -> 8 con objetivo 8-10):
  //    seguis dentro, pero la caida dice que el peso esta en el limite. El
  //    umbral es el ancho del rango, no un numero fijo: con un rango angosto
  //    perder dos reps ya es caer del techo al piso.
  if (drop >= Math.max(2, max - min)) {
    return verdict(
      `Caés de ${first} a ${last} entre series. Estás en el rango, pero la caída dice que el peso está en el límite.`,
      'mantener',
      { confidence: 'media' },
    );
  }

  // 7. Dentro del rango, parejo: sumar reps antes de tocar el peso.
  return verdict(
    `Todas las series dentro del rango (${min}-${max}). Sumá reps antes de subir el peso.`,
    'sumar_reps',
    { confidence: 'alta' },
  );
}

/**
 * Peso con el que arrancar hoy, mirando la ultima vez que se hizo el
 * ejercicio. Es lo que precarga el input de la primera serie: en el gimnasio
 * casi siempre se empieza donde se dejo.
 */
export function suggestedOpeningWeight({ lastSets, target, loadType }) {
  const weight = topWeight(lastSets);
  if (weight == null) return null;
  const v = deterministicVerdict({ sets: lastSets, target, loadType });
  if (v.action === 'subir' || v.action === 'bajar') return v.suggestedWeightKg ?? weight;
  return weight;
}

/**
 * Detecta estancamiento: mismo ejercicio, varias sesiones, sin mejora en el
 * mejor 1RM estimado. Alimenta las sugerencias de la vista de progreso.
 *
 * @param {Array<{date: string, sets: Array}>} historial mas nuevo primero
 */
export function detectPlateau(historial, minSessions = 3) {
  const puntos = (historial ?? [])
    .map((s) => {
      const best = workingSets(s.sets)
        .map((x) => estimated1rm(x.weightKg, x.reps))
        .filter((n) => n != null);
      return best.length ? { date: s.date, best: Math.max(...best) } : null;
    })
    .filter(Boolean);

  if (puntos.length < minSessions) return { plateau: false, sessions: puntos.length };

  const ventana = puntos.slice(0, minSessions);
  const mejor = Math.max(...ventana.map((p) => p.best));
  const masViejo = ventana[ventana.length - 1].best;
  // Menos de 2% de mejora en la ventana = estancado.
  const mejora = (mejor - masViejo) / masViejo;
  return { plateau: mejora < 0.02, sessions: ventana.length, improvement: mejora };
}
