import { describe, expect, it } from 'vitest';
import { bodyweightEntrySchema, hasMeasurements, measurementsSchema } from './schemas.js';
import { MEASUREMENTS, MEASUREMENT_LABELS } from './constants.js';

const base = {
  _id: 'bw-1',
  ownerId: 'u1',
  date: '2026-08-24T10:00:00.000Z',
  kg: 63.9,
  clientUpdatedAt: '2026-08-24T10:00:00.000Z',
};

describe('bodyweightEntrySchema · medidas', () => {
  // Lo mas importante de todo: hay pesajes ya guardados en los telefonos sin
  // este campo. Si esto se rompe, la app no arranca para quien ya la usaba.
  it('un pesaje viejo sin el campo sigue parseando, sin migración', () => {
    const r = bodyweightEntrySchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data.measurements).toEqual({
      shoulders: null,
      chest: null,
      arm: null,
      waist: null,
    });
  });

  it('acepta medirse sólo algunas cosas', () => {
    const r = bodyweightEntrySchema.safeParse({
      ...base,
      measurements: { arm: 33.5, waist: 78 },
    });
    expect(r.success).toBe(true);
    expect(r.data.measurements.arm).toBe(33.5);
    expect(r.data.measurements.chest).toBeNull();
  });

  it('acepta decimales: media cinta importa en un brazo', () => {
    const r = measurementsSchema.safeParse({ arm: 33.5 });
    expect(r.success).toBe(true);
    expect(r.data.arm).toBe(33.5);
  });

  it('rechaza valores imposibles', () => {
    expect(measurementsSchema.safeParse({ arm: 0 }).success).toBe(false);
    expect(measurementsSchema.safeParse({ arm: -5 }).success).toBe(false);
    expect(measurementsSchema.safeParse({ chest: 900 }).success).toBe(false);
  });

  // El formulario manda '' cuando el campo quedó vacío. Convertirlo a null es
  // responsabilidad del repo, pero el esquema tiene que rechazarlo igual: si
  // algún día se saltea esa conversión, esto lo caza.
  it('rechaza el string vacío en vez de guardarlo como cero', () => {
    expect(measurementsSchema.safeParse({ arm: '' }).success).toBe(false);
  });

  it('el peso sigue siendo obligatorio', () => {
    const { kg, ...sinPeso } = base;
    expect(bodyweightEntrySchema.safeParse({ ...sinPeso, measurements: { arm: 33 } }).success)
      .toBe(false);
  });
});

describe('hasMeasurements', () => {
  it('distingue no haberse medido de haberse medido', () => {
    expect(hasMeasurements(null)).toBe(false);
    expect(hasMeasurements(undefined)).toBe(false);
    expect(hasMeasurements({})).toBe(false);
    expect(hasMeasurements({ shoulders: null, chest: null, arm: null, waist: null })).toBe(false);
    expect(hasMeasurements({ shoulders: null, chest: null, arm: 33, waist: null })).toBe(true);
  });
});

describe('constantes', () => {
  it('todas las medidas tienen etiqueta en castellano', () => {
    for (const k of MEASUREMENTS) {
      expect(MEASUREMENT_LABELS[k]).toBeTruthy();
    }
  });

  // El orden es de arriba hacia abajo, que es como se toman. Si alguien lo
  // reordena por alfabético, anotar cuatro números parecidos se vuelve más
  // fácil de equivocar.
  it('el orden va de arriba hacia abajo', () => {
    expect(MEASUREMENTS).toEqual(['shoulders', 'chest', 'arm', 'waist']);
  });
});
