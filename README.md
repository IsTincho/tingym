# tingym

App de entrenamiento offline-first con una capa de interpretación sobre los
números. El documento de producto está en
[PROYECTO-app-entrenamiento.md](PROYECTO-app-entrenamiento.md).

## Dónde vive

| Pieza | Dónde | URL |
|-------|-------|-----|
| Frontend (PWA) | Cloudflare Pages, proyecto `tingym` | https://tingym.pages.dev |
| API | Railway, proyecto `tingym`, servicio `api` | https://api-production-d27fa.up.railway.app |
| Base | Railway, servicio `MongoDB` | interna, vía `MONGO_URL` |

## Estructura

```
shared/   esquemas Zod + motor de progresión + análisis (cliente y servidor)
client/   React + Vite + Dexie + PWA
server/   Express + MongoDB: auth, sync y coach
```

`shared` es el que importa: la lógica de progresión y los insights son
funciones puras, sin red y con tests. La IA se apoya encima, nunca reemplaza
esa base — en el subsuelo del gimnasio no hay señal.

## Desarrollo

```bash
npm install
npm run dev          # cliente en localhost:5173
npm run dev:server   # API (necesita MONGO_URL y JWT_SECRET)
npm test             # tests del motor de progresión y de los insights
```

## Deploy

Frontend:

```bash
npm run build && npx wrangler pages deploy client/dist --project-name tingym --branch main
```

API (desde la raíz del repo, con el CLI de Railway o el MCP):

```bash
railway up
```

## Variables del servicio `api`

| Variable | Para qué |
|----------|----------|
| `MONGO_URL` | Referencia a `${{MongoDB.MONGO_URL}}` |
| `MONGO_DB` | `gymapp` |
| `JWT_SECRET` | Firma de los tokens. Sin esto el server no arranca. |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma |
| `ANTHROPIC_API_KEY` | **Falta configurarla.** Sin ella `/api/coach/verdict` responde con el fallback determinista y `degraded: "sin API key configurada"`. |
| `ANTHROPIC_MODEL` | Opcional, por defecto `claude-sonnet-5` |

La key de Anthropic nunca toca el cliente: es la razón por la que existe el
backend.

## Cómo está resuelto el offline

- Todo se escribe primero en IndexedDB (Dexie) y la UI nunca espera a la red.
- Cada documento lleva `syncState` y `clientUpdatedAt`.
- `POST /api/sync` empuja lo pendiente y baja lo que cambió desde `since`, con
  last-write-wins sobre `clientUpdatedAt`. Sin CRDTs: no hay edición
  concurrente real, es un usuario con varios dispositivos.
- Los ids se generan en el cliente (uuid) y Mongo los acepta como `_id`, así
  que crear una rutina sin señal no necesita después ningún remapeo.
