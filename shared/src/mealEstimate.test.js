import { describe, expect, it } from 'vitest';
import { mealEstimateSchema } from './schemas.js';

// Este esquema es la unica reja entre lo que devuelve el modelo y lo que se
// guarda en el diario. El modelo puede contestar cualquier cosa, asi que lo
// que se prueba aca no es "el esquema funciona" sino "las formas raras que
// puede tener una respuesta de IA caen del lado correcto".
describe('mealEstimateSchema', () => {
  it('acepta una estimacion completa', () => {
    const r = mealEstimateSchema.safeParse({ kcal: 620, proteinG: 48, confidence: 'alta' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ kcal: 620, proteinG: 48, confidence: 'alta' });
  });

  it('acepta los dos numeros en null: es la respuesta a un texto sin comida', () => {
    const r = mealEstimateSchema.safeParse({ kcal: null, proteinG: null, confidence: 'baja' });
    expect(r.success).toBe(true);
    expect(r.data.kcal).toBeNull();
    expect(r.data.proteinG).toBeNull();
  });

  it('acepta que estime uno solo de los dos', () => {
    const r = mealEstimateSchema.safeParse({ kcal: 300, proteinG: null, confidence: 'media' });
    expect(r.success).toBe(true);
    expect(r.data.kcal).toBe(300);
    expect(r.data.proteinG).toBeNull();
  });

  // Las kcal son enteras a proposito: "610.4 kcal" finge una precision que una
  // estimacion no tiene. La proteina si admite decimales porque los gramos de
  // una porcion chica importan mas.
  it('rechaza kcal con decimales y acepta proteina con decimales', () => {
    expect(mealEstimateSchema.safeParse({ kcal: 610.4, proteinG: 40, confidence: 'alta' }).success)
      .toBe(false);
    expect(mealEstimateSchema.safeParse({ kcal: 610, proteinG: 40.5, confidence: 'alta' }).success)
      .toBe(true);
  });

  it('rechaza negativos y valores absurdos', () => {
    expect(mealEstimateSchema.safeParse({ kcal: -100, proteinG: 10, confidence: 'alta' }).success)
      .toBe(false);
    expect(mealEstimateSchema.safeParse({ kcal: 999999, proteinG: 10, confidence: 'alta' }).success)
      .toBe(false);
    expect(mealEstimateSchema.safeParse({ kcal: 500, proteinG: -1, confidence: 'alta' }).success)
      .toBe(false);
  });

  // El modelo tiene que contestar en castellano. Si contesta "high" es que
  // ignoro el prompt, y una respuesta que ignoro el prompt no es confiable en
  // los numeros tampoco: cae entera.
  it('rechaza una confianza fuera del enum', () => {
    expect(mealEstimateSchema.safeParse({ kcal: 500, proteinG: 30, confidence: 'high' }).success)
      .toBe(false);
    expect(mealEstimateSchema.safeParse({ kcal: 500, proteinG: 30 }).success).toBe(false);
  });

  // Sin default: si falta un numero el esquema lo pone en null en vez de
  // fallar. Es la diferencia entre "el modelo omitio el campo" y "el modelo
  // mando basura", y la primera se puede salvar.
  it('completa con null los numeros ausentes', () => {
    const r = mealEstimateSchema.safeParse({ confidence: 'baja' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ kcal: null, proteinG: null, confidence: 'baja' });
  });

  it('rechaza kcal en texto: un numero como string no es un numero', () => {
    expect(mealEstimateSchema.safeParse({ kcal: '500', proteinG: 30, confidence: 'alta' }).success)
      .toBe(false);
  });
});
