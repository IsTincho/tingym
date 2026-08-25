import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// Se importa dinamico y despues de armar el entorno porque llm.js lee
// process.env en cada llamada, no al cargar. Si eso cambiara, este test seria
// el primero en romperse, que es justo lo que queremos.
const { llmJson, llmConfig, llmConfigurado, extraerJson } = await import('./llm.js');

// Servidor falso que habla el formato de OpenAI. Es lo mismo que hablan Groq y
// Gemini, asi que probar contra esto prueba el cliente de verdad: lo unico que
// cambia con el proveedor real es la URL y el nombre del modelo.
let servidor;
let puerto;
let proxima = { status: 200, cuerpo: null, demoraMs: 0 };
let ultimaPeticion = null;

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      ultimaPeticion = {
        auth: req.headers.authorization,
        contentType: req.headers['content-type'],
        body: (() => {
          try {
            return JSON.parse(body);
          } catch {
            return null;
          }
        })(),
      };
      const responder = () => {
        res.writeHead(proxima.status, { 'Content-Type': 'application/json' });
        res.end(
          typeof proxima.cuerpo === 'string'
            ? proxima.cuerpo
            : JSON.stringify(proxima.cuerpo ?? {}),
        );
      };
      if (proxima.demoraMs) setTimeout(responder, proxima.demoraMs);
      else responder();
    });
  });
  await new Promise((r) => servidor.listen(0, r));
  puerto = servidor.address().port;
});

afterAll(() => new Promise((r) => servidor.close(r)));

afterEach(() => {
  proxima = { status: 200, cuerpo: null, demoraMs: 0 };
  ultimaPeticion = null;
  for (const k of [
    'LLM_PROVIDER',
    'LLM_API_KEY',
    'LLM_URL',
    'LLM_MODEL',
    'GROQ_API_KEY',
    'GEMINI_API_KEY',
    'OPENAI_API_KEY',
  ]) {
    delete process.env[k];
  }
});

function apuntarAlFalso() {
  process.env.LLM_URL = `http://127.0.0.1:${puerto}/v1/chat/completions`;
  process.env.LLM_API_KEY = 'key-de-prueba';
  process.env.LLM_MODEL = 'modelo-de-prueba';
}

const conTexto = (texto) => ({ choices: [{ message: { content: texto } }] });

describe('llmConfig', () => {
  it('sin ninguna key no hay proveedor: es el modo degradado, no un error', () => {
    expect(llmConfig()).toBeNull();
    expect(llmConfigurado()).toBe(false);
  });

  it('groq es el default y no hace falta nombrarlo', () => {
    process.env.GROQ_API_KEY = 'gsk_x';
    const c = llmConfig();
    expect(c.nombre).toBe('groq');
    expect(c.url).toContain('api.groq.com');
    expect(c.modelo).toBe('llama-3.3-70b-versatile');
  });

  // El punto de toda esta capa: cambiar de proveedor es una variable, no una
  // reescritura. Si este test se cae, la capa dejo de servir para lo que se
  // hizo.
  it('cambiar de proveedor es una sola variable', () => {
    process.env.LLM_API_KEY = 'x';
    process.env.LLM_PROVIDER = 'gemini';
    const c = llmConfig();
    expect(c.nombre).toBe('gemini');
    expect(c.url).toContain('generativelanguage.googleapis.com');
  });

  it('LLM_MODEL pisa el modelo del preset sin tocar la URL', () => {
    process.env.GROQ_API_KEY = 'x';
    process.env.LLM_MODEL = 'otro-modelo';
    const c = llmConfig();
    expect(c.modelo).toBe('otro-modelo');
    expect(c.url).toContain('api.groq.com');
  });

  it('un proveedor que no existe no explota: degrada', () => {
    process.env.LLM_API_KEY = 'x';
    process.env.LLM_PROVIDER = 'inventado';
    expect(llmConfig()).toBeNull();
  });

  it('custom exige URL y modelo propios', () => {
    process.env.LLM_API_KEY = 'x';
    process.env.LLM_PROVIDER = 'custom';
    expect(llmConfig()).toBeNull();
    process.env.LLM_URL = 'http://localhost:11434/v1/chat/completions';
    process.env.LLM_MODEL = 'llama3';
    expect(llmConfig().nombre).toBe('custom');
  });
});

describe('llmJson', () => {
  it('manda el formato de OpenAI con el bearer correcto', async () => {
    apuntarAlFalso();
    proxima.cuerpo = conTexto('{"kcal":500}');
    const r = await llmJson({ system: 'sos un sistema', user: 'hola' });

    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ kcal: 500 });
    expect(ultimaPeticion.auth).toBe('Bearer key-de-prueba');
    expect(ultimaPeticion.body.model).toBe('modelo-de-prueba');
    expect(ultimaPeticion.body.messages).toEqual([
      { role: 'system', content: 'sos un sistema' },
      { role: 'user', content: 'hola' },
    ]);
  });

  // Los modelos abiertos obedecen el "solo JSON" menos que Claude, asi que
  // esto no es paranoia: es el caso normal.
  it('rescata el JSON envuelto en backticks', async () => {
    apuntarAlFalso();
    proxima.cuerpo = conTexto('```json\n{"kcal":300,"proteinG":20}\n```');
    const r = await llmJson({ system: 's', user: 'u' });
    expect(r.ok).toBe(true);
    expect(r.data.kcal).toBe(300);
  });

  it('rescata el JSON con prosa alrededor', async () => {
    apuntarAlFalso();
    proxima.cuerpo = conTexto('Claro, acá va:\n{"kcal":410}\nEspero que sirva.');
    const r = await llmJson({ system: 's', user: 'u' });
    expect(r.ok).toBe(true);
    expect(r.data.kcal).toBe(410);
  });

  it('si no hay JSON rescatable, degrada en vez de tirar', async () => {
    apuntarAlFalso();
    proxima.cuerpo = conTexto('no tengo idea de qué comiste');
    const r = await llmJson({ system: 's', user: 'u' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('respuesta no parseable');
  });

  // 429 se distingue del resto porque es el unico que se arregla esperando, y
  // con un plan gratis es el que va a aparecer.
  it('el 429 dice que se espere, no un error generico', async () => {
    apuntarAlFalso();
    proxima.status = 429;
    proxima.cuerpo = { error: 'rate limit' };
    const r = await llmJson({ system: 's', user: 'u' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/límite|limite/i);
  });

  it('un 500 del proveedor degrada con el código', async () => {
    apuntarAlFalso();
    proxima.status = 500;
    const r = await llmJson({ system: 's', user: 'u' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('500');
  });

  // Sin timeout, una llamada colgada deja al usuario mirando "Estimando..."
  // para siempre. En el gimnasio la señal se corta a la mitad todo el tiempo.
  it('corta por timeout en vez de colgarse', async () => {
    apuntarAlFalso();
    proxima.demoraMs = 300;
    proxima.cuerpo = conTexto('{"kcal":1}');
    const r = await llmJson({ system: 's', user: 'u', timeoutMs: 60 });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/tardó demasiado/);
  });

  it('sin key no sale a la red siquiera', async () => {
    const r = await llmJson({ system: 's', user: 'u' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('sin API key configurada');
    expect(ultimaPeticion).toBeNull();
  });

  it('una respuesta sin choices degrada', async () => {
    apuntarAlFalso();
    proxima.cuerpo = { algo: 'raro' };
    const r = await llmJson({ system: 's', user: 'u' });
    expect(r.ok).toBe(false);
  });
});

describe('extraerJson', () => {
  it('devuelve null en vez de tirar con basura', () => {
    expect(extraerJson('')).toBeNull();
    expect(extraerJson(null)).toBeNull();
    expect(extraerJson('{roto')).toBeNull();
  });
});
