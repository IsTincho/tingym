import { MongoClient } from 'mongodb';

let client;
let database;

export async function connect() {
  if (database) return database;
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error('Falta MONGO_URL');
  client = new MongoClient(uri);
  await client.connect();
  database = client.db(process.env.MONGO_DB || 'gymapp');
  await ensureIndexes(database);
  return database;
}

export function db() {
  if (!database) throw new Error('La base todavía no está conectada');
  return database;
}

async function ensureIndexes(d) {
  await Promise.all([
    d.collection('users').createIndex({ email: 1 }, { unique: true }),
    // El sync pide "todo lo mio cambiado despues de X": ownerId + updatedAt
    // es exactamente esa consulta, en ese orden.
    d.collection('routines').createIndex({ ownerId: 1, updatedAt: -1 }),
    d.collection('sessions').createIndex({ ownerId: 1, updatedAt: -1 }),
    d.collection('sessions').createIndex({ ownerId: 1, date: -1 }),
    d.collection('bodyweight').createIndex({ ownerId: 1, updatedAt: -1 }),
    d.collection('meals').createIndex({ ownerId: 1, updatedAt: -1 }),
    d.collection('exercises').createIndex({ ownerId: 1, updatedAt: -1 }),
  ]);
}

export async function close() {
  await client?.close();
  database = undefined;
}
