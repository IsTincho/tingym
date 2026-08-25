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
| API | Railway, proyecto `tingym`, servicio `api` (Express) | ⏳ falta `MONGO_URL` |
| Base | MongoDB Atlas M0 | ⏳ falta crear el cluster |

Railway ya está pago por otro proyecto, así que la API vive ahí. El frontend
se queda en Cloudflare Pages, que es gratis y ya estaba andando.

Mientras Atlas no esté, el frontend publicado sigue apuntando al Worker de
Cloudflare (`tingym-api`, sobre D1), que tiene todos los datos y funciona. La
app no se rompe en el medio: el cambio de backend es un solo deploy, al final.

El Worker queda en `worker/` como alternativa: mismo contrato de API y mismo
esquema de auth, así que se puede volver a él con un cambio de `VITE_API_URL`.

## Lo que falta (dos cosas, con login propio)

**1. Cluster de Atlas.** En https://cloud.mongodb.com: plan **M0**, región São
Paulo; un usuario en *Database Access*; y `0.0.0.0/0` en *Network Access*
(Railway no tiene IP fija). Copiar la connection string y agregarle la base:
`...mongodb.net/gymapp?retryWrites=true&w=majority`.

Después, un solo comando desde la raíz del repo:

```bash
node server/scripts/finalizar-setup.js "<URI_ATLAS>"
```

Prueba la conexión, importa los datos que están en D1, guarda `MONGO_URL` en
Railway, despliega la API, espera a que responda y republica el frontend
apuntado a ella. Si algo falla, corta ahí y dice qué pasó.

**2. Autodeploys.** En el dashboard de Railway, servicio `api` → *Settings* →
*Connect Repo* → `IsTincho/tingym`. Requiere autorizar la GitHub App de
Railway, que es un login y por eso no se puede hacer desde acá. Con eso, cada
push a `main` despliega solo. `railway.json` ya trae `watchPatterns`, así que
un cambio que toque únicamente `client/` no dispara deploy de la API.

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
