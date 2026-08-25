import { kg } from '../lib/format.js';

// Colores por accion, no por severidad: el usuario aprende el codigo en dos
// sesiones y lo lee de reojo entre series. Cada accion tiene su neon.
const STYLE = {
  subir: 'bg-ok/10 text-ok border-ok/40 shadow-[0_0_16px_-6px_rgba(57,255,138,0.7)]',
  bajar: 'bg-warn/10 text-warn border-warn/40 shadow-[0_0_16px_-6px_rgba(255,176,32,0.7)]',
  mantener: 'bg-accent-2/10 text-accent-2 border-accent-2/40 shadow-[0_0_16px_-6px_rgba(0,229,255,0.7)]',
  sumar_reps: 'bg-accent-2/10 text-accent-2 border-accent-2/40 shadow-[0_0_16px_-6px_rgba(0,229,255,0.7)]',
  revisar_tecnica: 'bg-accent-3/10 text-accent-3 border-accent-3/50 shadow-[0_0_16px_-6px_rgba(192,38,211,0.8)]',
};

const LABEL = {
  subir: 'Subí',
  bajar: 'Bajá',
  mantener: 'Mantené',
  sumar_reps: 'Sumá reps',
  revisar_tecnica: 'Revisá',
};

export default function VerdictChip({ verdict, compact = false }) {
  if (!verdict) return null;
  const style = STYLE[verdict.action] ?? STYLE.mantener;

  if (compact) {
    return (
      <span
        className={`inline-block label-hud text-[10px] px-2.5 py-1.5 chamfer-sm border ${style}`}
      >
        {LABEL[verdict.action]}
        {verdict.suggestedWeightKg != null ? ` · ${kg(verdict.suggestedWeightKg)} kg` : ''}
      </span>
    );
  }

  return (
    <div className={`chamfer-sm border px-3.5 py-3 ${style}`}>
      <p className="font-display font-bold uppercase tracking-[0.08em]">
        {LABEL[verdict.action]}
        {verdict.suggestedWeightKg != null ? ` → ${kg(verdict.suggestedWeightKg)} kg` : ''}
      </p>
      <p className="text-sm text-text/85 mt-1 normal-case">{verdict.reading}</p>
      {/* De donde salio el veredicto: la regla local o la IA. Sin esto, el
          usuario no sabe si esta leyendo una heuristica o un analisis. */}
      <p className="label-hud text-[10px] opacity-55 mt-2">
        {verdict.source === 'ai' ? 'análisis IA' : 'regla local'} · conf {verdict.confidence}
      </p>
    </div>
  );
}
