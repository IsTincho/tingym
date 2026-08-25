# tingym

App de entrenamiento offline-first con una capa de interpretación sobre los
números. El documento de producto está en
[PROYECTO-app-entrenamiento.md](PROYECTO-app-entrenamiento.md) y la rutina
cargada, en [rutina-4-dias.md](rutina-4-dias.md).

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

## Deploy

```bash
npm run deploy:web   # build + Cloudflare Pages
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
| `ANTHROPIC_API_KEY` | **Sin configurar.** Sin ella `/api/coach/verdict` devuelve el fallback determinista, y la app ni ofrece el botón de análisis (`/api/health` informa `coach: false`). |
| `ANTHROPIC_MODEL` | Opcional, por defecto `claude-sonnet-5` |

La key de Anthropic nunca toca el cliente: es la razón por la que existe el
backend.

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
