import { describe, expect, it } from 'vitest';
import {
  deterministicVerdict,
  detectPlateau,
  suggestedOpeningWeight,
  weightStep,
} from './progression.js';

const target = { targetSets: 4, repRangeMin: 6, repRangeMax: 8, restSeconds: 150 };

const sets = (...pares) =>
  pares.map(([weightKg, reps, extra = {}]) => ({
    weightKg,
    reps,
    rpe: null,
    failed: false,
    note: '',
    loggedAt: '2026-08-24T12:00:00.000Z',
    ...extra,
  }));

describe('deterministicVerdict — casos del documento maestro', () => {
  it('12 reps con objetivo de 6-8: el peso está liviano, subí', () => {
    const v = deterministicVerdict({
      sets: sets([40, 12], [40, 12], [40, 12], [40, 12]),
      target,
      loadType: 'barbell',
    });
    expect(v.action).toBe('subir');
    // Pasarse largo del techo justifica salto doble, no el minimo.
    expect(v.suggestedWeightKg).toBe(45);
    expect(v.confidence).toBe('alta');
  });

  it('llegaste al techo del rango en las 4 series: subí un paso', () => {
    const v = deterministicVerdict({
      sets: sets([40, 8], [40, 8], [40, 8], [40, 8]),
      target,
      loadType: 'barbell',
    });
    expect(v.action).toBe('subir');
    expect(v.suggestedWeightKg).toBe(42.5);
  });

  it('caés de 10 a 8 entre series dentro del rango: mantené', () => {
    const v = deterministicVerdict({
      sets: sets([30, 10], [30, 9], [30, 8], [30, 8]),
      target: { ...target, repRangeMin: 8, repRangeMax: 10 },
      loadType: 'dumbbell',
    });
    expect(v.action).toBe('mantener');
  });

  it('arrancás dentro del rango y caés por debajo del piso: mantené', () => {
    const v = deterministicVerdict({
      sets: sets([40, 8], [40, 7], [40, 5], [40, 4]),
      target,
      loadType: 'barbell',
    });
    expect(v.action).toBe('mantener');
    expect(v.reading).toContain('sobre el final');
  });

  it('ninguna serie llega al piso: bajá', () => {
    const v = deterministicVerdict({
      sets: sets([50, 5], [50, 4], [50, 4], [50, 3]),
      target,
      loadType: 'barbell',
    });
    expect(v.action).toBe('bajar');
    expect(v.suggestedWeightKg).toBe(47.5);
  });

  it('todo parejo dentro del rango: sumar reps antes de subir peso', () => {
    const v = deterministicVerdict({
      sets: sets([40, 7], [40, 7], [40, 7], [40, 6]),
      target,
      loadType: 'barbell',
    });
    expect(v.action).toBe('sumar_reps');
  });
});

describe('deterministicVerdict — bordes', () => {
  it('sin series no inventa un veredicto', () => {
    const v = deterministicVerdict({ sets: [], target, loadType: 'barbell' });
    expect(v.action).toBe('mantener');
    expect(v.confidence).toBe('baja');
  });

  it('ignora las series a medio llenar (reps en 0)', () => {
    const v = deterministicVerdict({
      sets: sets([40, 8], [40, 8], [40, 8], [40, 0]),
      target: { ...target, targetSets: 3 },
      loadType: 'barbell',
    });
    expect(v.action).toBe('subir');
  });

  it('dos fallos mandan a bajar aunque el rango se haya cumplido', () => {
    const v = deterministicVerdict({
      sets: sets([40, 8], [40, 8, { failed: true }], [40, 8, { failed: true }], [40, 8]),
      target,
      loadType: 'barbell',
    });
    expect(v.action).toBe('bajar');
    expect(v.suggestedWeightKg).toBe(35);
  });

  it('techo del rango con series faltantes no habilita subir', () => {
    const v = deterministicVerdict({
      sets: sets([40, 8], [40, 8]),
      target,
      loadType: 'barbell',
    });
    expect(v.action).toBe('mantener');
  });

  it('bodyweight no sugiere kilos', () => {
    const v = deterministicVerdict({
      sets: sets([null, 10], [null, 10], [null, 10], [null, 10]),
      target: { ...target, repRangeMax: 10 },
      loadType: 'bodyweight',
    });
    expect(v.suggestedWeightKg).toBeNull();
    expect(v.action).toBe('revisar_tecnica');
  });

  it('nunca sugiere peso negativo', () => {
    const v = deterministicVerdict({
      sets: sets([1, 2], [1, 2], [1, 1], [1, 1]),
      target,
      loadType: 'machine',
    });
    expect(v.suggestedWeightKg).toBeGreaterThanOrEqual(0);
  });
});

describe('weightStep', () => {
  it('usa medio paso con cargas chicas para no saltar un porcentaje enorme', () => {
    expect(weightStep('machine', 10)).toBe(2.5);
    expect(weightStep('machine', 60)).toBe(5);
  });

  it('barra sube de a 2.5 kg', () => {
    expect(weightStep('barbell', 60)).toBe(2.5);
  });
});

describe('suggestedOpeningWeight', () => {
  it('propone el peso siguiente cuando la última sesión pedía subir', () => {
    const w = suggestedOpeningWeight({
      lastSets: sets([40, 8], [40, 8], [40, 8], [40, 8]),
      target,
      loadType: 'barbell',
    });
    expect(w).toBe(42.5);
  });

  it('repite el peso cuando el veredicto es mantener', () => {
    const w = suggestedOpeningWeight({
      lastSets: sets([40, 8], [40, 7], [40, 5], [40, 4]),
      target,
      loadType: 'barbell',
    });
    expect(w).toBe(40);
  });

  it('sin historial no propone nada', () => {
    expect(suggestedOpeningWeight({ lastSets: [], target, loadType: 'barbell' })).toBeNull();
  });
});

describe('detectPlateau', () => {
  const sesion = (date, weightKg, reps) => ({ date, sets: sets([weightKg, reps]) });

  it('con menos de tres sesiones no dictamina', () => {
    const r = detectPlateau([sesion('2026-08-20', 40, 8), sesion('2026-08-13', 40, 8)]);
    expect(r.plateau).toBe(false);
    expect(r.sessions).toBe(2);
  });

  it('mismo peso y mismas reps tres sesiones seguidas es estancamiento', () => {
    const r = detectPlateau([
      sesion('2026-08-20', 40, 8),
      sesion('2026-08-13', 40, 8),
      sesion('2026-08-06', 40, 8),
    ]);
    expect(r.plateau).toBe(true);
  });

  it('subir el peso rompe el estancamiento', () => {
    const r = detectPlateau([
      sesion('2026-08-20', 45, 8),
      sesion('2026-08-13', 42.5, 8),
      sesion('2026-08-06', 40, 8),
    ]);
    expect(r.plateau).toBe(false);
  });
});
