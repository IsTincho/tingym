-- Los documentos anidados (dias, entries, sets) viven en una columna JSON.
-- Es el mismo modelo que en Mongo: lo que se consulta esta indexado, y el
-- resto del documento viaja entero. D1 es SQLite, y SQLite maneja JSON bien.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  pass_hash     TEXT NOT NULL,
  salt          TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'athlete',
  gym_id        TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Una tabla por coleccion, todas con la misma forma: lo que el sync filtra
-- (owner_id, updated_at) en columnas, el documento en data.
CREATE TABLE IF NOT EXISTS exercises (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT,
  updated_at        TEXT NOT NULL,
  client_updated_at TEXT,
  data              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  client_updated_at TEXT,
  data              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  client_updated_at TEXT,
  data              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bodyweight (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  client_updated_at TEXT,
  data              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meals (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  client_updated_at TEXT,
  data              TEXT NOT NULL
);

-- "todo lo mio cambiado despues de X" es la unica consulta del sync.
CREATE INDEX IF NOT EXISTS idx_exercises_owner  ON exercises  (owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_routines_owner   ON routines   (owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_owner   ON sessions   (owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_bodyweight_owner ON bodyweight (owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_meals_owner      ON meals      (owner_id, updated_at);
