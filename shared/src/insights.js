import { detectPlateau, totalVolume, estimated1rm } from './progression.js';

// Analisis sobre el historial ya registrado. Igual que el motor de
// progresion: funciones puras, sin red. Todo lo que la app "sugiere" sale de
// aca; la IA (V2) se suma encima, no reemplaza.

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); // semana arranca lunes
  return d;
}

export function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

const BUCKET = { day: startOfDay, week: startOfWeek, month: startOfMonth };

/** Clave estable por periodo, para agrupar y ordenar como texto. */
export function periodKey(date, period) {
  const d = (BUCKET[period] ?? startOfDay)(date);
  return d.toISOString().slice(0, 10);
}

/**
 * Agrega sesiones terminadas por dia, semana o mes.
 * @returns {Array<{key, from, sessions, sets, volumeKg, exercises}>} mas nuevo primero
 */
export function aggregateSessions(sessions, period = 'week') {
  const buckets = new Map();

  for (const s of sessions ?? []) {
    if (s.status !== 'done') continue;
    const key = periodKey(s.date, period);
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        from: (BUCKET[period] ?? startOfDay)(s.date).toISOString(),
        sessions: 0,
        sets: 0,
        volumeKg: 0,
        exercises: new Set(),
      });
    }
    const b = buckets.get(key);
    b.sessions += 1;
    for (const e of s.entries) {
      const done = e.sets.filter((x) => Number(x.reps) > 0);
      if (done.length === 0) continue;
      b.sets += done.length;
      b.volumeKg += totalVolume(done);
      b.exercises.add(e.exerciseId);
    }
  }

  return [...buckets.values()]
    .map((b) => ({ ...b, exercises: b.exercises.size }))
    .sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * Serie temporal de un ejercicio: peso tope, volumen y 1RM estimado por
 * sesion. Es el dato crudo del seguimiento "peso de cada ejercicio".
 * @param {Array<{date, sets}>} history mas nuevo primero
 */
export function exerciseSeries(history) {
  return (history ?? [])
    .map((h) => {
      const done = h.sets.filter((s) => Number(s.reps) > 0);
      if (done.length === 0) return null;
      const withWeight = done.filter((s) => s.weightKg != null);
      const top = withWeight.length ? Math.max(...withWeight.map((s) => s.weightKg)) : null;
      const best = withWeight
        .map((s) => estimated1rm(s.weightKg, s.reps))
        .filter((n) => n != null);
      return {
        date: h.date,
        topWeightKg: top,
        totalReps: done.reduce((a, s) => a + Number(s.reps), 0),
        volumeKg: totalVolume(done),
        best1rm: best.length ? Math.max(...best) : null,
        sets: done.length,
      };
    })
    .filter(Boolean);
}

/** Media movil simple, mas viejo primero en la salida. */
export function movingAverage(values, window = 3) {
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

/**
 * Tendencia de peso corporal sobre pesajes semanales.
 * @param {Array<{date, kg}>} entries mas nuevo primero
 */
export function bodyweightTrend(entries) {
  const list = [...(entries ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (list.length < 2) return { trend: 'sin_datos', deltaKg: 0, weeks: list.length };

  const avg = movingAverage(list.map((e) => e.kg), 3);
  const deltaKg = avg[avg.length - 1] - avg[0];
  const weeks = Math.max(
    1,
    Math.round(
      (new Date(list[list.length - 1].date) - new Date(list[0].date)) / (7 * 864e5),
    ),
  );
  const perWeek = deltaKg / weeks;

  // Menos de 100 g por semana es ruido de balanza, no una tendencia.
  let trend = 'estable';
  if (perWeek > 0.1) trend = 'subiendo';
  else if (perWeek < -0.1) trend = 'bajando';

  return { trend, deltaKg, perWeekKg: perWeek, weeks, latestKg: list[list.length - 1].kg };
}

const DAY = 864e5;

/**
 * Sugerencias derivadas del historial. Cada una trae `severity` para poder
 * ordenarlas y un texto ya redactado: la UI solo las muestra.
 *
 * @param {object} input
 * @param {Array} input.sessions        sesiones terminadas, mas nuevas primero
 * @param {Array} input.bodyweight      pesajes, mas nuevos primero
 * @param {Map}   input.exercisesById   catalogo para nombrar y agrupar
 * @param {Date}  input.now
 */
export function buildInsights({ sessions = [], bodyweight = [], exercisesById, now = new Date() }) {
  const out = [];
  const done = sessions.filter((s) => s.status === 'done');
  const name = (id) => exercisesById?.get(id)?.name ?? 'Ese ejercicio';

  // --- frecuencia de entrenamiento ---
  const last7 = done.filter((s) => now - new Date(s.date) < 7 * DAY).length;
  const prev7 = done.filter((s) => {
    const age = now - new Date(s.date);
    return age >= 7 * DAY && age < 14 * DAY;
  }).length;

  if (done.length === 0) {
    out.push({
      id: 'sin-datos',
      severity: 'info',
      title: 'Todavía no hay entrenamientos registrados',
      body: 'Registrá una sesión completa y las sugerencias empiezan a salir solas.',
    });
  } else if (last7 === 0) {
    out.push({
      id: 'frecuencia-cero',
      severity: 'alta',
      title: 'Ninguna sesión en los últimos 7 días',
      body: `La semana anterior habías entrenado ${prev7} ${prev7 === 1 ? 'vez' : 'veces'}.`,
    });
  } else if (prev7 > 0 && last7 < prev7) {
    out.push({
      id: 'frecuencia-baja',
      severity: 'media',
      title: `Entrenaste ${last7} ${last7 === 1 ? 'vez' : 'veces'} esta semana`,
      body: `La semana pasada fueron ${prev7}.`,
    });
  }

  // --- volumen semana contra semana ---
  const semanas = aggregateSessions(done, 'week');
  if (semanas.length >= 2 && semanas[1].volumeKg > 0) {
    const cambio = (semanas[0].volumeKg - semanas[1].volumeKg) / semanas[1].volumeKg;
    if (cambio <= -0.25) {
      out.push({
        id: 'volumen-baja',
        severity: 'media',
        title: `El volumen cayó ${Math.round(Math.abs(cambio) * 100)}% respecto de la semana pasada`,
        body: `${Math.round(semanas[0].volumeKg)} kg contra ${Math.round(semanas[1].volumeKg)} kg totales.`,
      });
    } else if (cambio >= 0.4) {
      out.push({
        id: 'volumen-salto',
        severity: 'media',
        title: `El volumen saltó ${Math.round(cambio * 100)}% en una semana`,
        body: 'Saltos así de golpe son de donde suelen salir las molestias. Sostenelo antes de subir más.',
      });
    }
  }

  // --- estancamiento por ejercicio ---
  const porEjercicio = new Map();
  for (const s of done) {
    for (const e of s.entries) {
      const list = porEjercicio.get(e.exerciseId) ?? [];
      list.push({ date: s.date, sets: e.sets });
      porEjercicio.set(e.exerciseId, list);
    }
  }

  for (const [exerciseId, historial] of porEjercicio) {
    const orden = historial.sort((a, b) => b.date.localeCompare(a.date));
    const { plateau, sessions: n } = detectPlateau(orden);
    if (plateau && n >= 3) {
      out.push({
        id: `plateau-${exerciseId}`,
        severity: 'media',
        exerciseId,
        title: `${name(exerciseId)} está planchado hace ${n} sesiones`,
        body: 'Mismo peso y mismas reps. Probá sumar una serie, bajar el descanso o cambiar a una variante por unas semanas.',
      });
    }
  }

  // --- grupo muscular sin tocar ---
  if (exercisesById && done.length > 0) {
    const ultimoPorGrupo = new Map();
    for (const s of done) {
      for (const e of s.entries) {
        const g = exercisesById.get(e.exerciseId)?.muscleGroup;
        if (!g) continue;
        const prev = ultimoPorGrupo.get(g);
        if (!prev || s.date > prev) ultimoPorGrupo.set(g, s.date);
      }
    }
    for (const [grupo, fecha] of ultimoPorGrupo) {
      const dias = Math.floor((now - new Date(fecha)) / DAY);
      if (dias >= 14) {
        out.push({
          id: `abandono-${grupo}`,
          severity: 'media',
          title: `Hace ${dias} días que no entrenás ${grupo}`,
          body: 'Si no fue a propósito, metelo en el próximo día que te toque.',
        });
      }
    }
  }

  // --- peso corporal ---
  const tendencia = bodyweightTrend(bodyweight);
  if (tendencia.trend !== 'sin_datos' && tendencia.weeks >= 3) {
    const kg = Math.abs(tendencia.deltaKg).toFixed(1);
    if (tendencia.trend === 'bajando') {
      out.push({
        id: 'peso-bajando',
        severity: 'info',
        title: `Bajaste ${kg} kg en ${tendencia.weeks} semanas`,
        body: 'Si el objetivo es ganar fuerza, esperá progresiones más lentas mientras el peso baja.',
      });
    } else if (tendencia.trend === 'subiendo') {
      out.push({
        id: 'peso-subiendo',
        severity: 'info',
        title: `Subiste ${kg} kg en ${tendencia.weeks} semanas`,
        body: 'Buen contexto para empujar las cargas.',
      });
    }
  }

  const orden = { alta: 0, media: 1, info: 2 };
  return out.sort((a, b) => orden[a.severity] - orden[b.severity]);
}
