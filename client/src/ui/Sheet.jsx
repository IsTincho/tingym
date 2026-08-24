import { useEffect } from 'react';
import { Button } from './primitives.jsx';

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
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative bg-surface border-t border-line rounded-t-3xl max-h-[85dvh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <h2 className="font-semibold">{title}</h2>
          <Button variant="ghost" onClick={onClose} className="px-2">
            Cerrar
          </Button>
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
