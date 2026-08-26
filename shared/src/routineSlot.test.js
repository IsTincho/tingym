import { describe, expect, it } from 'vitest';
import { routineSlotSchema, sessionEntrySchema } from './schemas.js';

// Las alternativas son el "Dominadas o jalon al pecho" de una rutina escrita a
// mano. Lo que se prueba aca no es que zod funcione, sino las formas invalidas
// que un editor descuidado puede producir y que romperian la sesion.
const base = {
  exerciseId: 'ex-dominadas',
  targetSets: 4,
  repRangeMin: 6,
  repRangeMax: 8,
  restSeconds: 150,
};

describe('routineSlotSchema · alternativas', () => {
  it('un slot sin alternativas sigue siendo valido y arranca en lista vacia', () => {
    const r = routineSlotSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data.alternativeIds).toEqual([]);
  });

  it('acepta hasta cuatro', () => {
    const cuatro = ['a', 'b', 'c', 'd'];
    expect(routineSlotSchema.safeParse({ ...base, alternativeIds: cuatro }).success).toBe(true);
    expect(
      routineSlotSchema.safeParse({ ...base, alternativeIds: [...cuatro, 'e'] }).success,
    ).toBe(false);
  });

  // Si el principal se cuela como alternativa, la sesion muestra un boton para
  // cambiar por el ejercicio que ya estas haciendo. Es un no-op confuso.
  it('rechaza el ejercicio principal como alternativa de si mismo', () => {
    const r = routineSlotSchema.safeParse({
      ...base,
      alternativeIds: ['ex-jalon-al-pecho', 'ex-dominadas'],
    });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(['alternativeIds']);
  });

  it('rechaza alternativas repetidas', () => {
    const r = routineSlotSchema.safeParse({
      ...base,
      alternativeIds: ['ex-jalon-al-pecho', 'ex-jalon-al-pecho'],
    });
    expect(r.success).toBe(false);
  });

  // El rango sigue validandose: agregar un refine no puede haber pisado al que
  // ya estaba.
  it('sigue rechazando un rango invertido', () => {
    expect(
      routineSlotSchema.safeParse({ ...base, repRangeMin: 12, repRangeMax: 6 }).success,
    ).toBe(false);
  });
});

describe('routineSlotSchema · por lado', () => {
  it('por defecto es bilateral', () => {
    expect(routineSlotSchema.safeParse(base).data.perSide).toBe(false);
  });

  // Es del slot y no del ejercicio: la misma plancha lateral puede ir por lado
  // un dia y a tiempo total otro.
  it('se marca por slot', () => {
    const r = routineSlotSchema.safeParse({ ...base, perSide: true });
    expect(r.success).toBe(true);
    expect(r.data.perSide).toBe(true);
  });

  it('un slot viejo sin el campo sigue parseando', () => {
    const { ...viejo } = base;
    expect(routineSlotSchema.safeParse(viejo).success).toBe(true);
  });
});

describe('sessionEntrySchema · alternativas copiadas', () => {
  it('una entrada vieja sin el campo sigue parseando', () => {
    const r = sessionEntrySchema.safeParse({ exerciseId: 'ex-sentadilla' });
    expect(r.success).toBe(true);
    expect(r.data.alternativeIds).toEqual([]);
  });

  it('conserva las alternativas que vinieron del slot', () => {
    const r = sessionEntrySchema.safeParse({
      exerciseId: 'ex-dominadas',
      alternativeIds: ['ex-jalon-al-pecho', 'ex-dominada-supina'],
    });
    expect(r.success).toBe(true);
    expect(r.data.alternativeIds).toHaveLength(2);
  });
});
