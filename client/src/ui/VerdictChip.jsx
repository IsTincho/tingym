import { kg } from '../lib/format.js';

// Colores por accion, no por severidad: el usuario aprende el codigo en dos
// sesiones y lo lee de reojo entre series.
const STYLE = {
  subir: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  bajar: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  mantener: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  sumar_reps: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  revisar_tecnica: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
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
      <span className={`inline-block text-xs font-semibold px-2 py-1 rounded-lg border ${style}`}>
        {LABEL[verdict.action]}
        {verdict.suggestedWeightKg != null ? ` a ${kg(verdict.suggestedWeightKg)} kg` : ''}
      </span>
    );
  }

  return (
    <div className={`rounded-xl border px-3 py-2 ${style}`}>
      <p className="text-sm font-semibold">
        {LABEL[verdict.action]}
        {verdict.suggestedWeightKg != null ? ` → ${kg(verdict.suggestedWeightKg)} kg` : ''}
      </p>
      <p className="text-sm opacity-90 mt-0.5">{verdict.reading}</p>
      {/* De donde salio el veredicto: la regla local o la IA. Sin esto, el
          usuario no sabe si esta leyendo una heuristica o un analisis. */}
      <p className="text-[11px] opacity-60 mt-1">
        {verdict.source === 'ai' ? 'análisis IA' : 'regla local'} · confianza {verdict.confidence}
      </p>
    </div>
  );
}
