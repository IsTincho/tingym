import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

const cx = (...c) => c.filter(Boolean).join(' ');

// min-h-12 en todo lo tocable: dedo sudado, celular en una mano.
// El chamfer reemplaza al radio: la esquina cortada es el idioma del HUD.
export const Button = forwardRef(function Button(
  { variant = 'primary', className, ...props },
  ref,
) {
  const base =
    'relative inline-flex items-center justify-center gap-2 min-h-12 px-5 chamfer-sm ' +
    'font-display uppercase tracking-[0.1em] text-sm font-bold ' +
    'transition-[transform,box-shadow,opacity,background-color] active:scale-[0.98] ' +
    'disabled:opacity-35 disabled:active:scale-100 disabled:shadow-none select-none';
  const variants = {
    primary: 'bg-accent text-ink glow-red active:bg-accent-soft',
    secondary: 'bg-surface-2 text-text glow-red-soft',
    ghost: 'bg-transparent text-muted hover:text-text',
    danger: 'bg-transparent text-danger glow-red-soft',
    cyan: 'bg-transparent text-accent-2 glow-cyan',
  };
  return <button ref={ref} className={cx(base, variants[variant], className)} {...props} />;
});

// El hairline superior marca el borde vivo de la tarjeta. `tone` lo pinta de
// cian cuando la tarjeta es informativa y no accionable.
export function Card({ className, tone = 'red', ...props }) {
  return (
    <div
      className={cx(
        'rig-edge chamfer bg-surface border border-line',
        tone === 'cyan' && 'rig-edge-cyan',
        tone === 'none' && '[&::before]:hidden',
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label && (
        <span className="block label-hud text-[11px] text-muted mb-2">{label}</span>
      )}
      {children}
      {error ? (
        <span className="block text-sm text-danger mt-1.5 font-display">{error}</span>
      ) : hint ? (
        <span className="block text-sm text-muted mt-1.5">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  'w-full min-h-12 px-3 chamfer-sm bg-surface-2 border border-line text-text font-display ' +
  'placeholder:text-muted placeholder:font-sans outline-none ' +
  'transition-[border-color,box-shadow] focus:border-accent focus:glow-red-soft';

export function Input({ className, ...props }) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }) {
  return <select className={cx(inputClass, 'appearance-none', className)} {...props} />;
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="text-center py-16 px-6">
      {/* Marca de sistema sin datos: el vacio tambien es una pantalla. */}
      <p className="label-hud text-[11px] text-accent mb-3">// sin datos</p>
      <p className="font-display uppercase tracking-[0.1em] font-bold">{title}</p>
      {hint && <p className="text-muted text-sm mt-2">{hint}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

// Link de volver de las pantallas de detalle.
//
// Existe como componente porque estaba copiado igual en cuatro lados y en los
// cuatro medía 13 px de alto: un <a> inline toma la altura de la línea, no la
// del dedo. Es el control mas usado de una pantalla de detalle y era el mas
// chico de la app.
//
// El -ml-2/px-2 agranda el area tocable hacia el margen de la pagina sin
// mover el texto: queda alineado con el titulo de abajo, pero se puede errar
// dos milimetros a la izquierda y igual funciona.
export function BackLink({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center min-h-11 -ml-2 px-2 label-hud text-[10px]
                 text-muted active:text-accent"
    >
      {children}
    </Link>
  );
}

// Titulo de pantalla: glitch corto al montar y filete rojo debajo.
export function PageTitle({ children, className }) {
  const text = typeof children === 'string' ? children : undefined;
  return (
    <h1
      className={cx('glitch text-2xl font-bold text-glow-red', className)}
      data-text={text}
    >
      {children}
    </h1>
  );
}

// Etiqueta de seccion. Reemplaza al h2 gris de antes: mismo peso informativo,
// tono de terminal.
export function SectionLabel({ children, className }) {
  return (
    <h2 className={cx('label-hud text-[11px] text-muted mb-2.5 flex items-center gap-2', className)}>
      <span className="inline-block w-1.5 h-1.5 bg-accent rotate-45 shrink-0 shadow-[0_0_6px_0_rgba(255,42,74,0.9)]" />
      {children}
    </h2>
  );
}
