import { forwardRef } from 'react';

const cx = (...c) => c.filter(Boolean).join(' ');

// min-h-12 en todo lo tocable: dedo sudado, celular en una mano.
export const Button = forwardRef(function Button(
  { variant = 'primary', className, ...props },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-12 px-4 rounded-xl font-semibold ' +
    'transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 select-none';
  const variants = {
    primary: 'bg-accent text-ink',
    secondary: 'bg-surface-2 text-text border border-line',
    ghost: 'bg-transparent text-muted',
    danger: 'bg-transparent text-danger border border-line',
  };
  return <button ref={ref} className={cx(base, variants[variant], className)} {...props} />;
});

export function Card({ className, ...props }) {
  return (
    <div
      className={cx('bg-surface border border-line rounded-2xl', className)}
      {...props}
    />
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label && <span className="block text-sm text-muted mb-1.5">{label}</span>}
      {children}
      {error ? (
        <span className="block text-sm text-danger mt-1">{error}</span>
      ) : hint ? (
        <span className="block text-sm text-muted mt-1">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  'w-full min-h-12 px-3 rounded-xl bg-surface-2 border border-line text-text ' +
  'placeholder:text-muted/60 outline-none focus:border-accent';

export function Input({ className, ...props }) {
  return <input className={cx(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }) {
  return <select className={cx(inputClass, 'appearance-none', className)} {...props} />;
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="text-center py-14 px-6">
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-muted text-sm mt-1">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
