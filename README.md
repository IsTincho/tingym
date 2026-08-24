# tingym

App de entrenamiento offline-first con una capa de interpretación sobre los
números. El documento de producto está en
[PROYECTO-app-entrenamiento.md](PROYECTO-app-entrenamiento.md) y la rutina
cargada, en [rutina-4-dias.md](rutina-4-dias.md).

## Dónde vive

| Pieza | Dónde | URL |
|-------|-------|-----|
| Frontend (PWA) | Cloudflare Pages, proyecto `tingym` | https://tingym.pages.dev |
| API | Cloudflare Workers, `tingym-api` | https://tingym-api.segninitincho.workers.dev |
| Base | Cloudflare D1, `tingym-db` | binding `DB` |

Todo en la capa gratuita de Cloudflare y en la misma cuenta. **Costo cero.**

Antes esto vivía en Railway con MongoDB (Express + driver de Mongo). Se migró
porque Railway cobra por uso y la app no lo justifica. El backend de Express
está en el historial de git, hasta el commit que lo eliminó, por si alguna vez
hace falta volver.

## Estructura

```
shared/   esquemas Zod, catálogo, motor de progresión y análisis
client/   React + Vite + Dexie + PWA
worker/   Cloudflare Worker sobre D1: auth, sync y coach
```

`shared` es el que importa: la lógica de progresión y los insights son
funciones puras, sin red y con tests. La IA se apoya encima, nunca reemplaza
esa base — en el subsuelo del gimnasio no hay señal.

## Desarrollo

```bash
npm install
npm run dev        # cliente en localhost:5173
npm run dev:api    # Worker con D1 local
npm test           # motor de progresión e insights
```

## Deploy

```bash
npm run deploy:web   # build + Cloudflare Pages
npm run deploy:api   # Worker
```

## Variables del Worker

Se cargan con `wrangler secret put <NOMBRE>` desde `worker/`.

| Variable | Para qué |
|----------|----------|
| `JWT_SECRET` | Firma de los tokens. Ya configurada. |
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

Los parámetros están en dos lugares —`client/src/db/authKey.js` y los scripts
de `worker/scripts/`— y **tienen que coincidir**: si divergen, el login falla
sin decir por qué.

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

Una tabla por colección, todas con la misma forma: lo que el sync filtra
(`owner_id`, `updated_at`) en columnas, y el documento entero en `data` como
JSON. Es el mismo modelo de documentos que en Mongo, sobre SQLite.

```bash
wrangler d1 execute tingym-db --remote --file=worker/schema.sql
```
