import { useEffect } from 'react';

// Hoja inferior en vez de modal centrado: el pulgar llega abajo, no al medio.
// Nunca se anida (restriccion 2.2): si hay una abierta, la pantalla no abre otra.
export default function Sheet({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-ink/80 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative chamfer-top bg-surface max-h-[85dvh] flex flex-col
                   shadow-[0_-1px_0_0_var(--color-accent),0_-18px_50px_-20px_rgba(255,42,74,0.55)]"
      >
        <div className="flex items-center justify-between pl-6 pr-3 py-3.5 border-b border-line shrink-0">
          <h2 className="label-hud text-xs text-accent text-glow-red truncate">{title}</h2>
          {/* Un boton, no un icono: se cierra con el pulgar sin apuntar. */}
          <button
            onClick={onClose}
            className="shrink-0 min-h-11 px-3 label-hud text-[11px] text-muted active:text-accent"
          >
            Cerrar ✕
          </button>
        </div>
        <div
          className="overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
