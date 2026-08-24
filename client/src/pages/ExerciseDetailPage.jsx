import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deterministicVerdict, detectPlateau, exerciseSeries } from '@gym/shared';
import { getExercise } from '../db/repo.js';
import { exerciseHistory } from '../db/sessionRepo.js';
import { Card, EmptyState } from '../ui/primitives.jsx';
import VerdictChip from '../ui/VerdictChip.jsx';
import { relativeDate, setsLabel, shortDate, kg } from '../lib/format.js';

export default function ExerciseDetailPage() {
  const { exerciseId } = useParams();
  const [exercise, setExercise] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([getExercise(exerciseId), exerciseHistory(exerciseId, { limit: 30 })]).then(
      ([ex, h]) => {
        if (!vivo) return;
        setExercise(ex ?? null);
        setHistory(h);
      },
    );
    return () => {
      vivo = false;
    };
  }, [exerciseId]);

  if (history === null) return null;

  const serie = exerciseSeries(history);
  const plateau = detectPlateau(history);
  const ultimo = history[0] ?? null;
  const verdict =
    ultimo && ultimo.target
      ? deterministicVerdict({
          sets: ultimo.sets,
          target: ultimo.target,
          loadType: exercise?.loadType,
        })
      : null;

  const maxTop = Math.max(...serie.map((s) => s.topWeightKg ?? 0), 1);
  const record = serie.reduce(
    (best, s) => (s.topWeightKg != null && s.topWeightKg > (best?.topWeightKg ?? 0) ? s : best),
    null,
  );

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <Link to="/progreso" className="text-muted text-sm">
          ← Progreso
        </Link>
        <h1 className="text-2xl font-bold mt-2">{exercise?.name ?? 'Ejercicio'}</h1>
        {exercise?.notes && <p className="text-sm text-muted mt-1">{exercise.notes}</p>}
      </header>

      {history.length === 0 ? (
        <EmptyState
          title="Todavía no lo entrenaste"
          hint="Aparece acá apenas termines una sesión con este ejercicio."
        />
      ) : (
        <div className="px-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Sesiones" value={history.length} />
            <Stat label="Récord" value={record?.topWeightKg != null ? `${kg(record.topWeightKg)} kg` : '—'} />
            <Stat
              label="Estado"
              value={plateau.plateau ? 'Planchado' : 'Progresando'}
              tone={plateau.plateau ? 'warn' : 'ok'}
            />
          </div>

          {verdict && (
            <div>
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
                Según la última vez
              </h2>
              <VerdictChip verdict={verdict} />
            </div>
          )}

          <section>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
              Peso tope por sesión
            </h2>
            <Card className="p-4 space-y-2">
              {serie.slice(0, 12).map((s) => (
                <div key={s.date} className="flex items-center gap-3">
                  <span className="text-xs text-muted w-16 shrink-0">{shortDate(s.date)}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${((s.topWeightKg ?? 0) / maxTop) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-20 text-right shrink-0">
                    {s.topWeightKg != null ? `${kg(s.topWeightKg)} kg` : `${s.totalReps} reps`}
                  </span>
                </div>
              ))}
            </Card>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
              Historial
            </h2>
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.sessionId}>
                  <Card className="p-4">
                    <div className="flex items-baseline justify-between">
                      <p className="font-semibold">{relativeDate(h.date)}</p>
                      {h.target && (
                        <p className="text-xs text-muted">
                          objetivo {h.target.repRangeMin}-{h.target.repRangeMax}
                        </p>
                      )}
                    </div>
                    <p className="text-sm mt-1">{setsLabel(h.sets)}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color =
    tone === 'warn' ? 'text-amber-300' : tone === 'ok' ? 'text-emerald-300' : 'text-text';
  return (
    <Card className="p-3 text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className={`font-bold mt-0.5 ${color}`}>{value}</p>
    </Card>
  );
}
