// Cronometro de descanso entre series.
//
// La decision que define todo lo demas: el estado es un INSTANTE DE FIN, no un
// contador que baja. Un `setInterval` que resta uno por segundo se rompe apenas
// bloqueas la pantalla —el navegador lo throttlea a una vez por minuto, o lo
// congela— y volves a los dos minutos con el reloj marcando quince segundos.
// Guardando `finishAt` y restando contra `Date.now()`, el tick sirve solo para
// repintar: si no corre, el numero igual esta bien cuando volves a mirar.
//
// Y volver a mirar es el caso normal, no el raro: descansas dos minutos con el
// telefono en el bolsillo.
//
// Vive en localStorage y no en Dexie porque no es un dato del entrenamiento,
// es el estado de un cronometro. Si se pierde no pasa nada, y no tiene por que
// viajar en el sync ni ensuciar el historial.

const CLAVE = 'tingym.descanso';

let estado = null; // { finishAt, totalMs, etiqueta } o null
const oyentes = new Set();

function leerGuardado() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const v = JSON.parse(crudo);
    if (typeof v?.finishAt !== 'number') return null;
    // Un descanso de hace tres horas es basura de una sesion vieja: el que
    // cierra la app a mitad de una serie no quiere que al otro dia le aparezca
    // un cronometro colgado.
    if (Date.now() - v.finishAt > 60 * 60 * 1000) return null;
    return v;
  } catch {
    return null;
  }
}

function guardar(v) {
  try {
    if (v) localStorage.setItem(CLAVE, JSON.stringify(v));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Modo privado o storage lleno. El cronometro sigue andando en memoria;
    // lo unico que se pierde es sobrevivir a un reload.
  }
}

estado = leerGuardado();

function avisar() {
  for (const fn of oyentes) fn();
}

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function leer() {
  return estado;
}

/** Arranca un descanso de `segundos`. Reiniciar mientras corre es valido. */
export function arrancar(segundos, etiqueta = '') {
  const s = Number(segundos);
  if (!Number.isFinite(s) || s <= 0) return;
  estado = { finishAt: Date.now() + s * 1000, totalMs: s * 1000, etiqueta };
  guardar(estado);
  avisar();
}

export function sumar(segundos) {
  if (!estado) return;
  estado = {
    ...estado,
    finishAt: estado.finishAt + segundos * 1000,
    totalMs: estado.totalMs + segundos * 1000,
  };
  guardar(estado);
  avisar();
}

export function cortar() {
  estado = null;
  guardar(null);
  avisar();
}

/** Milisegundos que faltan. Negativo si ya se paso: eso tambien es informacion. */
export function restante(ahora = Date.now()) {
  return estado ? estado.finishAt - ahora : 0;
}

/**
 * Vibra cuando se termina el descanso.
 *
 * Es el unico aviso que sirve con el telefono en el bolsillo y sin señal: un
 * sonido molesta al resto del gimnasio y una notificacion push necesita
 * servidor y permiso. Vibrar no necesita nada y funciona sin conexion.
 *
 * En iOS no existe y devuelve undefined sin romper: el aviso visual queda
 * igual, que es lo que ese usuario va a tener.
 */
export function vibrar() {
  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {
    // Algunos navegadores tiran si la pagina no tuvo interaccion del usuario.
  }
}
