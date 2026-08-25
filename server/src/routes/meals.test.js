import { createServer } from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// La ruta se puede probar entera sin Mongo porque requireAuth es JWT puro y
// /parse no toca la base. Lo unico que se reemplaza es el proveedor de LLM,
// por un servidor falso que habla el mismo formato de OpenAI que Groq.

process.env.JWT_SECRET = 'secreto-de-prueba';

const { default: mealRoutes } = await import('./meals.js');

let llmFalso;
let app;
let servidorApp;
let base;
let proxima;
let llamadasAlLlm;

const token = jwt.sign({ sub: 'u1', email: 'a@b.c', role: 'athlete' }, 'secreto-de-prueba');

beforeAll(async () => {
  llmFalso = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      llamadasAlLlm++;
      res.writeHead(proxima.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(proxima.cuerpo ?? {}));
    });
  });
  await new Promise((r) => llmFalso.listen(0, r));
  process.env.LLM_URL = `http://127.0.0.1:${llmFalso.address().port}/v1/chat/completions`;
  process.env.LLM_API_KEY = 'k';
  process.env.LLM_MODEL = 'm';

  app = express();
  app.use(express.json());
  app.use('/api/meals', mealRoutes);
  servidorApp = createServer(app);
  await new Promise((r) => servidorApp.listen(0, r));
  base = `http://127.0.0.1:${servidorApp.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => servidorApp.close(r));
  await new Promise((r) => llmFalso.close(r));
});

afterEach(() => {
  llamadasAlLlm = 0;
});

const responder = (obj) => {
  proxima = { status: 200, cuerpo: { choices: [{ message: { content: JSON.stringify(obj) } }] } };
};

function parse(description, { auth = true } = {}) {
  return fetch(`${base}/api/meals/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ description }),
  });
}

describe('POST /api/meals/parse', () => {
  it('sin token no contesta nada', async () => {
    const r = await parse('milanesa', { auth: false });
    expect(r.status).toBe(401);
  });

  it('rechaza una descripcion vacia', async () => {
    const r = await parse('   ');
    expect(r.status).toBe(400);
  });

  it('devuelve la estimacion del modelo', async () => {
    responder({ kcal: 780, proteinG: 42, confidence: 'alta' });
    const r = await parse('Milanesa con pure');
    const j = await r.json();
    expect(j.estimate).toEqual({ kcal: 780, proteinG: 42, confidence: 'alta' });
    expect(j.degraded).toBeUndefined();
  });

  // Es el caso que mas importa del diseño: "comi bien" no tiene calorias, y
  // devolver null es correcto. Tiene que llegar como estimacion valida, no
  // como error, porque la UI los muestra distinto.
  it('null en los dos numeros es una respuesta valida, no un error', async () => {
    responder({ kcal: null, proteinG: null, confidence: 'baja' });
    const r = await parse('comí bien');
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.estimate).toEqual({ kcal: null, proteinG: null, confidence: 'baja' });
    expect(j.degraded).toBeUndefined();
  });

  it('la segunda vez sale de la cache y no vuelve a llamar al modelo', async () => {
    responder({ kcal: 300, proteinG: 20, confidence: 'media' });
    await parse('Yogur con granola');
    expect(llamadasAlLlm).toBe(1);

    llamadasAlLlm = 0;
    const r = await parse('Yogur con granola');
    const j = await r.json();
    expect(j.cached).toBe(true);
    expect(j.estimate.kcal).toBe(300);
    expect(llamadasAlLlm).toBe(0);
  });

  it('la cache ignora mayusculas, tildes y puntuacion', async () => {
    responder({ kcal: 610, proteinG: 18, confidence: 'media' });
    await parse('Fideos con tuco');
    llamadasAlLlm = 0;
    const j = await (await parse('  fideos con TUCO.  ')).json();
    expect(j.cached).toBe(true);
    expect(llamadasAlLlm).toBe(0);
  });

  // Lo contrario tambien tiene que valer: normalizar de mas seria peor que de
  // menos. Dos cantidades distintas son dos comidas distintas.
  it('la cache NO junta cantidades distintas', async () => {
    responder({ kcal: 330, proteinG: 62, confidence: 'alta' });
    await parse('200 g de pollo');
    llamadasAlLlm = 0;
    responder({ kcal: 495, proteinG: 93, confidence: 'alta' });
    const j = await (await parse('300 g de pollo')).json();
    expect(j.cached).toBeUndefined();
    expect(j.estimate.kcal).toBe(495);
    expect(llamadasAlLlm).toBe(1);
  });

  // Si se cachearan las vacias, un fallo pasajero condenaria a ese texto a no
  // estimarse nunca mas.
  it('no cachea una estimacion vacia', async () => {
    responder({ kcal: null, proteinG: null, confidence: 'baja' });
    await parse('algo indescifrable');
    llamadasAlLlm = 0;
    responder({ kcal: 500, proteinG: 30, confidence: 'media' });
    const j = await (await parse('algo indescifrable')).json();
    expect(j.cached).toBeUndefined();
    expect(j.estimate.kcal).toBe(500);
    expect(llamadasAlLlm).toBe(1);
  });

  it('un fallo del proveedor degrada con estimacion vacia y motivo', async () => {
    proxima = { status: 429, cuerpo: {} };
    const j = await (await parse('pizza de muzzarella')).json();
    expect(j.estimate).toEqual({ kcal: null, proteinG: null, confidence: 'baja' });
    expect(j.degraded).toMatch(/límite|limite/i);
  });

  it('una respuesta fuera de esquema degrada en vez de guardar basura', async () => {
    responder({ kcal: 'un montón', proteinG: 40, confidence: 'alta' });
    const j = await (await parse('guiso de lentejas')).json();
    expect(j.estimate.kcal).toBeNull();
    expect(j.degraded).toBe('respuesta fuera de esquema');
  });
});
