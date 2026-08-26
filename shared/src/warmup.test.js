import { describe, expect, it } from 'vitest';
import { deterministicVerdict, topWeight, totalVolume, workingSets } from './progression.js';
import { exerciseSeries } from './insights.js';
import { setSchema } from './schemas.js';

const set = (weightKg, reps, extra = {}) => ({
  weightKg,
  reps,
  rpe: null,
  failed: false,
  warmup: false,
  note: '',
  loggedAt: '2026-08-26T10:00:00.000Z',
  ...extra,
});
const calent = (w, r) => set(w, r, { warmup: true });

const target = { targetSets: 4, repRangeMin: 6, repRangeMax: 8, restSeconds: 150 };

describe('setSchema · calentamiento', () => {
  it('una serie vieja sin el campo entra como de trabajo', () => {
    const { warmup, ...vieja } = set(60, 8);
    expect(setSchema.safeParse(vieja).data.warmup).toBe(false);
  });
});

describe('workingSets', () => {
  it('deja afuera el calentamiento y las series sin reps', () => {
    const lista = [calent(40, 12), set(60, 8), set(0, 0), set(60, 7)];
    expect(workingSets(lista)).toHaveLength(2);
  });
});

describe('el calentamiento no ensucia las métricas', () => {
  // Este es el bug concreto. Calentar con 40 kg × 12 y después trabajar con
  // 60 × 7 hacía que el motor viera la primera serie en 12 reps: por encima
  // del techo del rango, y una caída de 5 reps hasta la última. Dos señales
  // falsas sobre una sesión perfectamente normal.
  it('no corre el primer valor del rango ni inventa una caída', () => {
    const conCalentamiento = [calent(40, 12), calent(45, 10), set(60, 7), set(60, 7), set(60, 7), set(60, 7)];
    const soloTrabajo = [set(60, 7), set(60, 7), set(60, 7), set(60, 7)];

    const a = deterministicVerdict({ sets: conCalentamiento, target });
    const b = deterministicVerdict({ sets: soloTrabajo, target });
    expect(a.action).toBe(b.action);
    expect(a.reading).toBe(b.reading);
  });

  it('el peso tope ignora el calentamiento pesado mal cargado', () => {
    // Un 400 tipeado de más en el calentamiento no puede volverse el récord.
    expect(topWeight([calent(400, 5), set(60, 8)])).toBe(60);
  });

  it('el volumen no cuenta el calentamiento', () => {
    expect(totalVolume([calent(40, 10), set(60, 10)])).toBe(totalVolume([set(60, 10)]));
  });

  it('la serie histórica ignora las sesiones donde sólo se calentó', () => {
    const historia = [
      { date: '2026-08-26T10:00:00.000Z', sets: [calent(40, 10)] },
      { date: '2026-08-24T10:00:00.000Z', sets: [set(60, 8)] },
    ];
    const serie = exerciseSeries(historia);
    expect(serie).toHaveLength(1);
    expect(serie[0].topWeightKg).toBe(60);
  });

  // Sin esto, calentar dos veces haría que 2 series de trabajo cuenten como 4
  // y el motor daría por completado un objetivo que no se cumplió.
  it('no cuenta como objetivo completo por haber calentado', () => {
    const dosDeTrabajo = [calent(40, 8), calent(45, 8), set(60, 8), set(60, 8)];
    const v = deterministicVerdict({ sets: dosDeTrabajo, target });
    expect(v.action).not.toBe('subir');
  });

  it('una entrada de puro calentamiento no tiene veredicto de progresión', () => {
    const v = deterministicVerdict({ sets: [calent(40, 12), calent(45, 10)], target });
    expect(v.action).toBe('mantener');
    expect(v.confidence).toBe('baja');
  });
});
