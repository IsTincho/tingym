// Ids generados en el cliente: crear una rutina no puede depender de la red.
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback para entornos sin WebCrypto (Node viejo, tests).
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowIso() {
  return new Date().toISOString();
}
