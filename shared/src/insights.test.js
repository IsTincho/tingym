import { describe, expect, it } from 'vitest';
import {
  aggregateSessions,
  bodyweightTrend,
  buildInsights,
  exerciseSeries,
  periodKey,
  startOfWeek,
} from './insights.js';

// Jueves a proposito: con NOW en lunes, "ayer" cae en la semana anterior y
// los buckets se parten donde el test no lo espera.
const NOW = new Date('2026-08-27T18:00:00.000Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();

const set = (weightKg, reps) => ({
  weightKg,
  reps,
  rpe: null,
  failed: false,
  note: '',
  loggedAt: daysAgo(0),
});

const session = (date, entries) => ({
  _id: `s-${date}`,
  status: 'done',
  date,
  entries: entries.map(([exerciseId, sets]) => ({
    exerciseId,
    substitutedFor: null,
    target: { targetSets: 4, repRangeMin: 6, repRangeMax: 8, restSeconds: 120, note: '' },
    sets,
    aiVerdict: null,
  })),
});

describe('agregación por período', () => {
  it('la semana arranca el lunes', () => {
    // Domingo 23/08/2026 pertenece a la semana del lunes 17.
    expect(startOfWeek(new Date('2026-08-23T12:00:00')).getDate()).toBe(17);
    expect(startOfWeek(new Date('2026-08-24T12:00:00')).getDate()).toBe(24);
  });

  it('suma volumen y series por semana', () => {
    const sesiones = [
      session(daysAgo(0), [['press', [set(40, 8), set(40, 8)]]]),
      session(daysAgo(1), [['press', [set(40, 8)]]]),
      session(daysAgo(10), [['press', [set(30, 10)]]]),
    ];
    const semanas = aggregateSessions(sesiones, 'week');
    expect(semanas).toHaveLength(2);
    expect(semanas[0].sessions).toBe(2);
    expect(semanas[0].sets).toBe(3);
    expect(semanas[0].volumeKg).toBe(40 * 8 * 3);
  });

  it('ignora las sesiones sin terminar', () => {
    const abierta = { ...session(daysAgo(0), [['press', [set(40, 8)]]]), status: 'in_progress' };
    expect(aggregateSessions([abierta], 'week')).toHaveLength(0);
  });

  it('agrupa por mes con la misma clave', () => {
    expect(periodKey('2026-08-24T10:00:00.000Z', 'month')).toBe(
      periodKey('2026-08-02T10:00:00.000Z', 'month'),
    );
  });
});

describe('exerciseSeries', () => {
  it('saca peso tope, reps y 1RM estimado por sesión', () => {
    const serie = exerciseSeries([
      { date: daysAgo(0), sets: [set(40, 8), set(45, 6)] },
      { date: daysAgo(7), sets: [set(40, 6)] },
    ]);
    expect(serie[0].topWeightKg).toBe(45);
    expect(serie[0].totalReps).toBe(14);
    expect(serie[0].volumeKg).toBe(40 * 8 + 45 * 6);
    expect(serie[0].best1rm).toBeGreaterThan(serie[1].best1rm);
  });

  it('descarta sesiones sin series válidas', () => {
    expect(exerciseSeries([{ date: daysAgo(0), sets: [set(40, 0)] }])).toHaveLength(0);
  });
});

describe('bodyweightTrend', () => {
  it('con un solo pesaje no dictamina', () => {
    expect(bodyweightTrend([{ date: daysAgo(0), kg: 80 }]).trend).toBe('sin_datos');
  });

  it('detecta bajada sostenida', () => {
    const t = bodyweightTrend([
      { date: daysAgo(0), kg: 78 },
      { date: daysAgo(7), kg: 79 },
      { date: daysAgo(14), kg: 80 },
      { date: daysAgo(21), kg: 81 },
    ]);
    expect(t.trend).toBe('bajando');
    expect(t.deltaKg).toBeLessThan(0);
  });

  it('el ruido de balanza no es tendencia', () => {
    const t = bodyweightTrend([
      { date: daysAgo(0), kg: 80.1 },
      { date: daysAgo(7), kg: 79.9 },
      { date: daysAgo(14), kg: 80.0 },
      { date: daysAgo(21), kg: 80.05 },
    ]);
    expect(t.trend).toBe('estable');
  });
});

describe('buildInsights', () => {
  const catalogo = new Map([
    ['press', { _id: 'press', name: 'Press militar sentado', muscleGroup: 'hombros' }],
    ['remo', { _id: 'remo', name: 'Remo con barra', muscleGroup: 'espalda' }],
  ]);

  it('sin historial invita a registrar, no inventa diagnósticos', () => {
    const r = buildInsights({ sessions: [], bodyweight: [], exercisesById: catalogo, now: NOW });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('sin-datos');
  });

  it('marca la semana sin entrenar como severidad alta', () => {
    const r = buildInsights({
      sessions: [session(daysAgo(9), [['press', [set(40, 8)]]])],
      bodyweight: [],
      exercisesById: catalogo,
      now: NOW,
    });
    expect(r[0].severity).toBe('alta');
    expect(r[0].id).toBe('frecuencia-cero');
  });

  it('detecta estancamiento en un ejercicio y lo nombra', () => {
    const sesiones = [0, 7, 14].map((d) => session(daysAgo(d), [['press', [set(40, 8)]]]));
    const r = buildInsights({
      sessions: sesiones,
      bodyweight: [],
      exercisesById: catalogo,
      now: NOW,
    });
    const plateau = r.find((x) => x.id === 'plateau-press');
    expect(plateau).toBeDefined();
    expect(plateau.title).toContain('Press militar sentado');
  });

  it('avisa por grupo muscular abandonado hace más de dos semanas', () => {
    const sesiones = [
      session(daysAgo(1), [['press', [set(40, 8)]]]),
      session(daysAgo(20), [['remo', [set(60, 8)]]]),
    ];
    const r = buildInsights({
      sessions: sesiones,
      bodyweight: [],
      exercisesById: catalogo,
      now: NOW,
    });
    expect(r.some((x) => x.id === 'abandono-espalda')).toBe(true);
    expect(r.some((x) => x.id === 'abandono-hombros')).toBe(false);
  });

  it('ordena por severidad: lo urgente primero', () => {
    const r = buildInsights({
      sessions: [session(daysAgo(9), [['press', [set(40, 8)]]])],
      bodyweight: [
        { date: daysAgo(0), kg: 78 },
        { date: daysAgo(7), kg: 79 },
        { date: daysAgo(14), kg: 80 },
        { date: daysAgo(21), kg: 81 },
      ],
      exercisesById: catalogo,
      now: NOW,
    });
    const severidades = r.map((x) => x.severity);
    expect(severidades[0]).toBe('alta');
    expect(severidades[severidades.length - 1]).toBe('info');
  });
});
