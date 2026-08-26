import { useEffect, useRef, useState } from 'react';
import { cortar, leer, restante, suscribir, sumar, vibrar } from '../lib/restTimer.js';

const mmss = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Barra de descanso. Fija abajo, porque mientras descansas mirás la lista de
 * ejercicios de arriba: taparla seria taparte justo lo que estas leyendo.
 *
 * No se renderiza nada cuando no hay descanso corriendo. Un cronometro en cero
 * ocupando lugar es ruido en una pantalla que ya es densa.
 */
export default function RestTimer() {
  const [, repintar] = useState(0);
  const yaVibro = useRef(false);

  useEffect(() => suscribir(() => repintar((n) => n + 1)), []);

  // El intervalo solo repinta; el numero sale de restar contra Date.now(), asi
  // que si el navegador lo throttlea en segundo plano no se atrasa nada.
  useEffect(() => {
    const id = setInterval(() => repintar((n) => n + 1), 500);
    // Al volver de la pantalla bloqueada, repintar ya: esperar medio segundo
    // mas se nota justo en el momento en que mirás el telefono.
    const alVolver = () => repintar((n) => n + 1);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  const estado = leer();
  const falta = restante();

  // La vibracion se dispara una sola vez por descanso, y el flag se resetea al
  // arrancar el siguiente. Sin esto vibra en cada repintado despues del cero.
  useEffect(() => {
    if (!estado) {
      yaVibro.current = false;
      return;
    }
    if (falta <= 0 && !yaVibro.current) {
      yaVibro.current = true;
      vibrar();
    }
    if (falta > 0) yaVibro.current = false;
  }, [estado, falta]);

  if (!estado) return null;

  const listo = falta <= 0;
  const progreso = listo ? 100 : 100 - (falta / estado.totalMs) * 100;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-40 bg-ink-2/95 backdrop-blur-md border-t
                 border-accent/30 pb-[env(safe-area-inset-bottom)]
                 shadow-[0_-1px_18px_-6px_rgba(255,42,74,0.55)]"
      role="timer"
      // El aviso al lector de pantalla va sólo al terminar. Anunciar cada
      // segundo seria insoportable.
      aria-live="polite"
      aria-label={listo ? 'Descanso terminado' : `Descanso, faltan ${mmss(falta)}`}
    >
      {/* Barra de progreso. Es la lectura periferica: te dice cuánto falta sin
          que tengas que leer el numero. */}
      <div className="h-[3px] bg-surface-2">
        <div
          className={`h-full transition-[width] duration-500 ease-linear ${
            listo ? 'bg-ok shadow-[0_0_10px_0_rgba(57,255,138,0.9)]'
                  : 'bg-accent shadow-[0_0_10px_0_rgba(255,42,74,0.75)]'
          }`}
          style={{ width: `${Math.min(100, progreso)}%` }}
        />
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="label-hud text-[9px] text-muted truncate">
            {listo ? '// a la barra' : `Descanso${estado.etiqueta ? ` · ${estado.etiqueta}` : ''}`}
          </p>
          <p
            className={`num text-2xl font-bold leading-none mt-0.5 tabular-nums ${
              listo ? 'text-ok animate-pulse motion-reduce:animate-none' : 'text-text'
            }`}
          >
            {listo ? `+${mmss(-falta)}` : mmss(falta)}
          </p>
        </div>

        <button
          onClick={() => sumar(30)}
          className="min-w-14 min-h-12 px-2 chamfer-sm bg-surface-2 border border-line
                     font-display font-bold text-sm text-accent-2 shrink-0
                     active:bg-accent-2 active:text-ink transition-colors"
        >
          +30s
        </button>
        <button
          onClick={cortar}
          className="min-w-16 min-h-12 px-3 chamfer-sm bg-accent text-ink glow-red
                     font-display font-bold uppercase text-sm tracking-[0.08em] shrink-0
                     active:bg-accent-soft transition-colors"
        >
          {listo ? 'Listo' : 'Saltar'}
        </button>
      </div>
    </div>
  );
}
