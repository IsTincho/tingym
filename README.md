# tingym

App de entrenamiento offline-first con una capa de interpretación sobre los
números. El documento de producto está en
[PROYECTO-app-entrenamiento.md](PROYECTO-app-entrenamiento.md) y la rutina
cargada, en [rutina-4-dias.md](rutina-4-dias.md). Lo que viene y todavía no se
decidió está en [PROXIMOS-PASOS.md](PROXIMOS-PASOS.md).

## Dónde vive

| Pieza | Dónde | Estado |
|-------|-------|--------|
| Repo | https://github.com/IsTincho/tingym (privado) | ✅ |
| Frontend (PWA) | Cloudflare Pages, proyecto `tingym` → https://tingym.pages.dev | ✅ |
| API | Railway, `tingym`/`api` (Express) → https://api-production-9963.up.railway.app | ✅ |
| Base | MongoDB Atlas M0, `cluster0`, base `gymapp` | ✅ |

Cada push a `main` despliega la API sola. `railway.json` trae `watchPatterns`,
así que un cambio que toque únicamente `client/` no dispara deploy de la API.

**El Root Directory del servicio tiene que ser `/`.** Railway sugiere `server`
al detectar el monorepo, y con eso el build no ve el `package.json` de la raíz:
`@gym/shared` es un workspace local, no un paquete publicado, así que npm lo
busca en el registry. El síntoma es `404 '@gym/shared@*' is not in this
registry`.

Railway ya está pago por otro proyecto, así que la API vive ahí. El frontend
se queda en Cloudflare Pages, que es gratis y ya estaba andando.

El Worker de Cloudflare queda en `worker/` como alternativa: mismo contrato de
API y mismo esquema de auth, así que se vuelve a él cambiando `VITE_API_URL`.

## Lo que queda pendiente

Nada bloqueante. Sólo `ANTHROPIC_API_KEY`, si alguna vez se quiere la capa de
IA; sin ella la app decide con la regla local y ni ofrece el botón.

Las decisiones abiertas (macros de las comidas, imágenes de ejercicios y el
modelo de entrenador/alumno) están investigadas y sin implementar en
[PROXIMOS-PASOS.md](PROXIMOS-PASOS.md).

## Secretos

`atlas-credentials.env` está en `.gitignore` y no se sube: tiene la contraseña
de la base. Lo mismo con cualquier volcado de datos. Los valores en uso viven
en las variables del servicio de Railway, que es donde tienen que estar.

## Estructura

```
shared/   esquemas Zod, catálogo, motor de progresión y análisis
client/   React + Vite + Dexie + PWA
server/   Express + MongoDB: auth, sync y coach   (el backend en uso)
worker/   el mismo backend como Cloudflare Worker sobre D1 (alternativa)
```

`shared` es el que importa: la lógica de progresión y los insights son
funciones puras, sin red y con tests. La IA se apoya encima, nunca reemplaza
esa base — en el subsuelo del gimnasio no hay señal.

## Desarrollo

```bash
npm install
npm run dev         # cliente en localhost:5173
npm run dev:server  # API Express (necesita MONGO_URL y JWT_SECRET)
npm run dev:api     # la variante Worker, con D1 local
npm test            # motor de progresión e insights
```

Las fotos de los ejercicios están commiteadas en
`client/public/exercises/<id>/`, así que no hay nada que bajar para trabajar.
Si se agregan ejercicios al catálogo:

```bash
npm run fetch:exercise-images
```

Baja lo que falte de [Free Exercise DB](https://github.com/yuhonas/free-exercise-db)
(Unlicense, dominio público), lo renombra al id del ejercicio y regenera
`shared/src/exercisePhotos.js`. Es idempotente. La tabla de equivalencias vive
en `scripts/fetch-exercise-images.mjs` y está indexada por **nombre** del
catálogo: si renombrás un ejercicio, el script falla en vez de dejar la foto
vieja pegada a un ejercicio que ya no es ese. Un ejercicio sin equivalente va
como `null` explícito y se queda sin foto, que es preferible a una foto
parecida-pero-no.

## Deploy

El frontend lo despliega **Cloudflare Pages** solo, en cada push a `main`:
el proyecto `tingym` está conectado a este repo por la integración de Git.
No hay tokens ni secrets que mantener — Cloudflare tiene su propio permiso
sobre el repo vía la GitHub App.

La configuración del build, si alguna vez hay que rehacerla:

| Opción | Valor | Por qué |
|--------|-------|---------|
| Framework preset | *None* | Es un monorepo con workspaces, no un preset conocido |
| Root directory | `/` | El install va desde la raíz: `@gym/shared` es un workspace local y no está publicado. Desde `client/` npm lo busca en el registry y falla con un 404 |
| Build command | `npm test && npm run build` | Los tests del motor de progresión son la red de seguridad: si se rompen, no se publica |
| Build output directory | `client/dist` | |

La versión de Node la fija `.node-version` (22). El `engines` del
`package.json` pide `>=22` y el default de Pages no siempre coincide.

> **Ojo si hay que recrear el proyecto:** Cloudflare **no** permite conectarle
> Git a un proyecto de Pages que ya existe y nació como Direct Upload. Si el
> proyecto pierde la conexión, hay que borrarlo y crearlo de nuevo con
> *Import an existing Git repository* — y recrearlo con el mismo nombre para
> no perder `tingym.pages.dev`.

La API no se toca acá: la despliega Railway sola, y sus `watchPatterns` ya
filtran los cambios que sólo tocan `client/`.

A mano, si hace falta:

```bash
npm run deploy:web   # build + Cloudflare Pages (requiere wrangler login)
railway up --service api   # API (o automático, con el repo conectado)
npm run deploy:api   # la variante Worker
```

## Variables de la API

En Railway: `railway variables --service api --set "NOMBRE=valor"`.
En el Worker: `wrangler secret put NOMBRE` desde `worker/`.

| Variable | Para qué |
|----------|----------|
| `MONGO_URL` | Connection string de Atlas. **Falta.** Sin esto el server no arranca, a propósito: mejor morir fuerte que responder 500 a todo y parecer sano. |
| `MONGO_DB` | `gymapp` |
| `JWT_SECRET` | Firma de los tokens. Ya configurada. |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma |
| `LLM_API_KEY` | **Sin configurar.** Enciende las dos features de IA a la vez, porque es una sola key: `/api/coach/verdict` (sin ella, fallback determinista) y `/api/meals/parse` (sin ella, escribís kcal y proteína a mano). En los dos casos la app ni ofrece el botón — `/api/health` informa `coach: false`. Se aceptan también `GROQ_API_KEY`, `GEMINI_API_KEY` y `OPENAI_API_KEY`, que es el nombre que usa la doc de cada uno. |
| `LLM_PROVIDER` | `groq` (por defecto), `gemini`, `openai` o `custom` |
| `LLM_MODEL` | Opcional. Pisa el modelo del preset sin tocar la URL |
| `LLM_URL` | Sólo para `custom`: cualquier endpoint compatible con OpenAI |

La key nunca toca el cliente: es la razón por la que existe el backend.

### El proveedor de IA

Todo pasa por `server/src/llm.js`, que habla el formato `/chat/completions` de
OpenAI con un `fetch` pelado y sin SDK de nadie. Groq, Gemini, OpenRouter,
Together y un Ollama local hablan todos ese formato, así que **cambiar de
proveedor es una variable de entorno**, no una reescritura. Este proyecto ya
cambió una vez; la segunda no tiene que doler.

| Proveedor | Gratis | Límites | ¿Entrena con tus prompts? |
|-----------|--------|---------|---------------------------|
| **Groq** (default) | Sí, sin tarjeta | 30 req/min, 1.000/día | **No**, tampoco en el plan gratis |
| Gemini | Sí, sin tarjeta | 15 req/min, 1.500/día | **Sí**, los términos del free tier lo permiten |

Groq es el default por la última columna. Por acá viaja lo que una persona come
y entrena: gratis son los dos, pero uno se lo queda. Los límites de Groq sobran
por dos órdenes de magnitud para un usuario que anota diez series y tres
comidas por día.

```bash
railway variables --service api --set "GROQ_API_KEY=gsk_..."
```

La key se saca en https://console.groq.com/keys, sin tarjeta. Para cambiar a
Gemini alcanza con `LLM_PROVIDER=gemini` y su key.

`/api/health` devuelve qué proveedor y modelo quedaron activos —nunca la key—,
así que después de tocar variables en Railway se confirma de un vistazo.

## Autenticación

El plan gratuito de Workers da 10 ms de CPU por request, así que bcrypt está
descartado: el login se cortaría siempre. El key stretching lo hace el
navegador (PBKDF2-SHA256, 210.000 iteraciones, ~50 ms) y el servidor sólo le
aplica un SHA-256 con sal propia, que cuesta microsegundos.

Efecto secundario buscado: la contraseña en limpio nunca sale del dispositivo,
y un dump de la base no alcanza para recuperarla.

Los parámetros están en `client/src/db/authKey.js` y en los scripts de
`worker/scripts/`, y **tienen que coincidir**: si divergen, el login falla sin
decir por qué.

Los dos backends usan el mismo esquema, así que los hashes se copian tal cual
de una base a la otra: migrar no necesita la contraseña de nadie.

## Cómo está resuelto el offline

- Todo se escribe primero en IndexedDB (Dexie) y la UI nunca espera a la red.
- Cada documento lleva `syncState` y `clientUpdatedAt`.
- `POST /api/sync` empuja lo pendiente y baja lo que cambió desde `since`, con
  last-write-wins sobre `clientUpdatedAt`. Sin CRDTs: no hay edición
  concurrente real, es un usuario con varios dispositivos.
- Los ids se generan en el cliente y D1 los acepta como clave primaria, así
  que crear una rutina sin señal no necesita después ningún remapeo.
- El catálogo global usa ids derivados del nombre (`ex-press-militar-sentado`),
  para que el mismo ejercicio tenga el mismo id en todos los dispositivos.

## Esquema de la base

En Mongo, una colección por entidad con el documento tal cual: es el modelo
del documento de producto.

En D1 (la variante Worker) hay una tabla por colección con la misma forma: lo
que el sync filtra (`owner_id`, `updated_at`) en columnas, y el documento
entero en `data` como JSON.

```bash
wrangler d1 execute tingym-db --remote --file=worker/schema.sql
```
