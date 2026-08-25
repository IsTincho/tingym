import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { deterministicVerdict, detectPlateau, exerciseSeries } from '@gym/shared';
import { getExercise } from '../db/repo.js';
import { exerciseHistory } from '../db/sessionRepo.js';
import { Card, EmptyState, PageTitle, SectionLabel } from '../ui/primitives.jsx';
import VerdictChip from '../ui/VerdictChip.jsx';
import ExercisePhotos from '../ui/ExercisePhotos.jsx';
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
        <Link to="/progreso" className="label-hud text-[10px] text-muted active:text-accent">
          ← Progreso
        </Link>
        <PageTitle className="mt-2 text-xl">{exercise?.name ?? 'Ejercicio'}</PageTitle>
        {exercise?.notes && (
          <p className="text-sm text-muted mt-2 border-l-2 border-accent-3/50 pl-3">
            {exercise.notes}
          </p>
        )}
      </header>

      {/* Antes del historial a proposito: el ejercicio que nunca hiciste es
          justo el que necesitas ver como se hace. Si no hay foto no dibuja
          nada, ni hueco ni cartel. */}
      <div className="px-4 pb-4">
        <ExercisePhotos exerciseId={exerciseId} name={exercise?.name ?? 'Ejercicio'} />
      </div>

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
              <SectionLabel>Según la última vez</SectionLabel>
              <VerdictChip verdict={verdict} />
            </div>
          )}

          <section>
            <SectionLabel>Peso tope por sesión</SectionLabel>
            <Card className="p-4 space-y-2">
              {serie.slice(0, 12).map((s) => (
                <div key={s.date} className="flex items-center gap-3">
                  <span className="num text-[10px] text-muted w-14 shrink-0">
                    {shortDate(s.date)}
                  </span>
                  <div className="flex-1 h-2 bg-surface-2 border border-line overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent-3
                                 shadow-[0_0_10px_0_rgba(255,42,74,0.75)]"
                      style={{ width: `${((s.topWeightKg ?? 0) / maxTop) * 100}%` }}
                    />
                  </div>
                  <span className="num text-sm font-bold w-20 text-right shrink-0">
                    {s.topWeightKg != null ? `${kg(s.topWeightKg)} kg` : `${s.totalReps} reps`}
                  </span>
                </div>
              ))}
            </Card>
          </section>

          <section>
            <SectionLabel>Historial</SectionLabel>
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.sessionId}>
                  <Card tone="cyan" className="p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="label-hud text-[10px] text-accent-2">{relativeDate(h.date)}</p>
                      {h.target && (
                        <p className="num text-[10px] text-muted shrink-0">
                          objetivo {h.target.repRangeMin}-{h.target.repRangeMax}
                        </p>
                      )}
                    </div>
                    <p className="text-sm mt-2 num text-text/90">{setsLabel(h.sets)}</p>
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
    tone === 'warn'
      ? 'text-warn'
      : tone === 'ok'
        ? 'text-ok'
        : 'text-accent text-glow-red';
  return (
    <Card className="p-3 text-center">
      <p className="label-hud text-[9px] text-muted">{label}</p>
      <p className={`num font-bold mt-1.5 ${color}`}>{value}</p>
    </Card>
  );
}
