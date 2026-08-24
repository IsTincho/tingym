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

## Mover la base a Mongo Atlas (free tier)

El M0 de Atlas es gratis de forma permanente y saca la mitad del consumo de
Railway. Los pasos, en orden:

1. Crear el cluster en https://cloud.mongodb.com — plan **M0**, la región más
   cercana (São Paulo).
2. En *Database Access*, crear un usuario con permiso de lectura y escritura.
3. En *Network Access*, permitir `0.0.0.0/0`. Railway no tiene IP fija, así
   que restringir por IP no es una opción acá.
4. Copiar la connection string (*Connect → Drivers*) y agregarle el nombre de
   la base: `.../gymapp?retryWrites=true&w=majority`.
5. Copiar los datos que ya están en Railway:

   ```bash
   node server/scripts/migrar-mongo.js "<URI_RAILWAY>" "<URI_ATLAS>"
   ```

   La URI de Railway sale de `railway variables --service MongoDB --kv`, campo
   `MONGO_PUBLIC_URL` (la interna, `mongodb.railway.internal`, sólo resuelve
   dentro de Railway).

6. Apuntar la API a la base nueva:

   ```bash
   railway variables --set "MONGO_URL=<URI_ATLAS>" --service api
   ```

7. Verificar que la API sigue viva y recién ahí borrar el servicio MongoDB de
   Railway:

   ```bash
   curl https://api-production-d27fa.up.railway.app/api/health
   ```

El script copia por upsert sobre `_id`: se puede correr dos veces sin duplicar
nada, y compara los conteos de las dos puntas antes de dar el ok.

## Cómo está resuelto el offline

- Todo se escribe primero en IndexedDB (Dexie) y la UI nunca espera a la red.
- Cada documento lleva `syncState` y `clientUpdatedAt`.
- `POST /api/sync` empuja lo pendiente y baja lo que cambió desde `since`, con
  last-write-wins sobre `clientUpdatedAt`. Sin CRDTs: no hay edición
  concurrente real, es un usuario con varios dispositivos.
- Los ids se generan en el cliente (uuid) y Mongo los acepta como `_id`, así
  que crear una rutina sin señal no necesita después ningún remapeo.
