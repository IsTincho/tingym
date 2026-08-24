import express from 'express';
import cors from 'cors';
import { connect } from './db.js';
import authRoutes from './routes/auth.js';
import syncRoutes from './routes/sync.js';
import coachRoutes from './routes/coach.js';

const app = express();

// El origen del frontend se configura por env; en desarrollo se abre para
// poder probar desde el celular en la red local.
const origins = (process.env.CORS_ORIGIN ?? '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '5mb' })); // una sync grande son varias sesiones

// `coach` le dice al cliente si la capa de IA esta configurada. Sin esto la
// app tendria que ofrecer un boton de analisis que siempre falla.
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, coach: Boolean(process.env.ANTHROPIC_API_KEY) }),
);

app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/coach', coachRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

const port = process.env.PORT || 3000;

connect()
  .then(() => {
    app.listen(port, () => console.log(`API escuchando en :${port}`));
  })
  .catch((err) => {
    // Sin base no hay nada que servir: mejor morir fuerte que responder 500 a
    // todo y que el deploy parezca sano.
    console.error('No se pudo conectar a Mongo:', err.message);
    process.exit(1);
  });
