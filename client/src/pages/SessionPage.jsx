import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { MUSCLE_GROUP_LABELS, deterministicVerdict } from '@gym/shared';
import { listExercises } from '../db/repo.js';
import {
  addEntry,
  exerciseBriefing,
  exerciseHistory,
  finishSession,
  getSession,
  logSet,
  removeEntry,
  removeSet,
  saveVerdict,
  substituteEntry,
} from '../db/sessionRepo.js';
import { requestVerdict } from '../db/sync.js';
import { Button, Card, EmptyState, Field, Input } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';
import VerdictChip from '../ui/VerdictChip.jsx';
import { relativeDate, restLabel, setLabel, setsLabel, kg } from '../lib/format.js';

export default function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const session = useLiveQuery(() => getSession(sessionId), [sessionId], null);
  const exercises = useLiveQuery(listExercises, [], null);
  const [open, setOpen] = useState(0);
  const [sheet, setSheet] = useState(null);

  const byId = useMemo(
    () => new Map((exercises ?? []).map((e) => [e._id, e])),
    [exercises],
  );

  if (session === undefined) {
    return <EmptyState title="Sesión inexistente" hint="Puede que la hayas descartado." />;
  }
  if (!session || exercises === null) return null;

  const hechas = session.entries.filter((e) => e.sets.some((s) => Number(s.reps) > 0)).length;

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 sticky top-0 bg-ink/95 backdrop-blur z-10">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">
            {session.dayKey ? `${session.dayKey} · ` : ''}Sesión
          </h1>
          <span className="text-sm text-muted">
            {hechas}/{session.entries.length}
          </span>
        </div>
        <p className="text-sm text-muted">{relativeDate(session.date)}</p>
      </header>

      <div className="px-4 space-y-3">
        {session.entries.length === 0 && (
          <p className="text-muted text-sm py-6 text-center">
            Sesión libre: agregá el primer ejercicio.
          </p>
        )}

        {session.entries.map((entry, i) => (
          <EntryCard
            key={`${entry.exerciseId}-${i}`}
            entry={entry}
            index={i}
            sessionId={session._id}
            exercise={byId.get(entry.exerciseId)}
            replaced={entry.substitutedFor ? byId.get(entry.substitutedFor) : null}
            expanded={open === i}
            onToggle={() => setOpen(open === i ? -1 : i)}
            onSubstitute={() => setSheet({ type: 'sub', index: i })}
            onRemove={() => removeEntry(session._id, i)}
          />
        ))}

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setSheet({ type: 'add' })}
        >
          + Agregar ejercicio suelto
        </Button>

        <Button
          className="w-full"
          onClick={async () => {
            if (hechas === 0) {
              if (!confirm('No registraste ninguna serie. ¿Terminar igual?')) return;
            }
            await finishSession(session._id);
            navigate('/hoy', { replace: true });
          }}
        >
          Terminar entrenamiento
        </Button>
      </div>

      <PickerSheet
        open={Boolean(sheet)}
        title={sheet?.type === 'sub' ? 'Cambiar por' : 'Agregar ejercicio'}
        exercises={exercises}
        onClose={() => setSheet(null)}
        onPick={async (ex) => {
          if (sheet.type === 'sub') await substituteEntry(session._id, sheet.index, ex._id);
          else await addEntry(session._id, ex._id, null);
          setSheet(null);
        }}
      />
    </div>
  );
}

function EntryCard({
  entry,
  index,
  sessionId,
  exercise,
  replaced,
  expanded,
  onToggle,
  onSubstitute,
  onRemove,
}) {
  const [briefing, setBriefing] = useState(null);
  const hechas = entry.sets.filter((s) => Number(s.reps) > 0);

  // El briefing (ultima vez + veredicto + peso de arranque) se lee una vez al
  // abrir la tarjeta: es historial cerrado, no cambia mientras entrenas.
  useEffect(() => {
    let vivo = true;
    if (!expanded || !exercise) return undefined;
    exerciseBriefing(entry.exerciseId, {
      target: entry.target,
      loadType: exercise.loadType,
      excludeSessionId: sessionId,
    }).then((b) => vivo && setBriefing(b));
    return () => {
      vivo = false;
    };
  }, [expanded, entry.exerciseId, entry.target, exercise, sessionId]);

  const verdictHoy =
    hechas.length > 0 && entry.target
      ? deterministicVerdict({
          sets: hechas,
          target: entry.target,
          loadType: exercise?.loadType,
        })
      : null;

  return (
    <Card className={expanded ? 'border-accent/40' : ''}>
      <button className="w-full text-left p-4" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{exercise?.name ?? 'Ejercicio'}</p>
            {replaced && (
              <p className="text-xs text-muted mt-0.5">en lugar de {replaced.name}</p>
            )}
            <p className="text-sm text-muted mt-0.5">
              {entry.target
                ? `${entry.target.targetSets} × ${entry.target.repRangeMin}-${entry.target.repRangeMax} · ${restLabel(entry.target.restSeconds)}`
                : 'sin objetivo'}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-muted">
            {hechas.length}
            {entry.target ? `/${entry.target.targetSets}` : ''}
          </span>
        </div>

        {hechas.length > 0 && (
          <p className="text-sm mt-2 text-text/90">{setsLabel(hechas)}</p>
        )}
        {!expanded && verdictHoy && (
          <div className="mt-2">
            <VerdictChip verdict={verdictHoy} compact />
          </div>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-line pt-3">
          {entry.target?.note && (
            <p className="text-sm text-muted italic">{entry.target.note}</p>
          )}

          {/* El bloque que hace que la app sirva: que hiciste la ultima vez. */}
          <LastTime briefing={briefing} />

          <SetLogger
            sessionId={sessionId}
            entryIndex={index}
            entry={entry}
            exercise={exercise}
            openingWeight={briefing?.openingWeight ?? null}
          />

          {hechas.length > 0 && (
            <ul className="space-y-1.5">
              {entry.sets.map((s, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between bg-surface-2 rounded-xl px-3 py-2"
                >
                  <span className="text-sm">
                    <span className="text-muted mr-2">{i + 1}.</span>
                    {setLabel(s)}
                    {s.failed && <span className="text-danger ml-2">fallo</span>}
                    {s.note && <span className="text-muted ml-2 italic">{s.note}</span>}
                  </span>
                  <button
                    className="text-muted text-sm px-2 min-h-9"
                    onClick={() => removeSet(sessionId, index, i)}
                    aria-label={`Borrar serie ${i + 1}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* El veredicto de la IA se guarda en la entrada y no se vuelve a
              pedir: cachearlo es lo que evita gastar una llamada por render. */}
          {entry.aiVerdict ? (
            <VerdictChip verdict={entry.aiVerdict} />
          ) : (
            <>
              {verdictHoy && <VerdictChip verdict={verdictHoy} />}
              {hechas.length > 0 && (
                <AnalyzeButton
                  sessionId={sessionId}
                  entryIndex={index}
                  entry={entry}
                  exercise={exercise}
                  fallback={verdictHoy}
                />
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onSubstitute}>
              Cambiar ejercicio
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('¿Sacar este ejercicio de la sesión?')) onRemove();
              }}
            >
              Sacar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// La IA es un extra sobre la regla local, nunca un requisito: si no hay red,
// no hay sesion o la API falla, la tarjeta sigue mostrando el veredicto
// determinista y el boton simplemente avisa que no se pudo.
function AnalyzeButton({ sessionId, entryIndex, entry, exercise, fallback }) {
  const [estado, setEstado] = useState('idle');

  async function analizar() {
    setEstado('cargando');
    const history = await exerciseHistory(entry.exerciseId, {
      limit: 3,
      excludeSessionId: sessionId,
    });
    const verdict = await requestVerdict({
      exerciseName: exercise?.name ?? 'ejercicio',
      loadType: exercise?.loadType ?? 'barbell',
      sets: entry.sets.filter((s) => Number(s.reps) > 0),
      target: entry.target ?? {
        targetSets: entry.sets.length || 1,
        repRangeMin: 6,
        repRangeMax: 12,
      },
      history: history.map((h) => ({ date: h.date, sets: h.sets })),
      context: { exerciseNumber: entryIndex + 1 },
    });

    if (!verdict) {
      setEstado('error');
      return;
    }
    await saveVerdict(sessionId, entryIndex, verdict);
    setEstado('idle');
  }

  if (!entry.target && !fallback) return null;

  return (
    <div>
      <Button
        variant="secondary"
        className="w-full"
        onClick={analizar}
        disabled={estado === 'cargando'}
      >
        {estado === 'cargando' ? 'Analizando…' : 'Analizar con IA'}
      </Button>
      {estado === 'error' && (
        <p className="text-sm text-muted mt-1 text-center">
          Sin conexión o sin cuenta: te queda la lectura de la regla local.
        </p>
      )}
    </div>
  );
}

function LastTime({ briefing }) {
  if (!briefing) return null;
  if (!briefing.last) {
    return (
      <p className="text-sm text-muted">
        Primera vez que registrás este ejercicio. Elegí un peso y arrancá.
      </p>
    );
  }
  return (
    <div className="bg-surface-2 rounded-xl p-3">
      <p className="text-xs text-muted uppercase tracking-wide">
        Última vez · {relativeDate(briefing.last.date)}
      </p>
      <p className="text-sm mt-1">{setsLabel(briefing.last.sets)}</p>
      {briefing.verdict && (
        <div className="mt-2">
          <VerdictChip verdict={briefing.verdict} compact />
        </div>
      )}
    </div>
  );
}

// Dos taps para anotar: los valores vienen precargados con lo que la regla
// determinista propone, asi que el caso normal es tocar "+ Serie" y listo.
// Los steppers son para el ajuste, no para el flujo feliz.
function SetLogger({ sessionId, entryIndex, entry, exercise, openingWeight }) {
  const sinCarga = exercise?.loadType === 'bodyweight' || exercise?.loadType === 'time';
  const ultima = [...entry.sets].reverse().find((s) => Number(s.reps) > 0) ?? null;

  const pesoInicial = ultima?.weightKg ?? openingWeight ?? null;
  const repsIniciales = ultima?.reps ?? entry.target?.repRangeMax ?? 8;

  const [weight, setWeight] = useState(pesoInicial);
  const [reps, setReps] = useState(repsIniciales);
  const [failed, setFailed] = useState(false);
  const [seed, setSeed] = useState(`${pesoInicial}-${repsIniciales}`);

  // Al registrar una serie cambia lo que conviene proponer para la siguiente.
  const semilla = `${pesoInicial}-${repsIniciales}`;
  if (semilla !== seed) {
    setSeed(semilla);
    setWeight(pesoInicial);
    setReps(repsIniciales);
    setFailed(false);
  }

  const step = exercise?.loadType === 'machine' ? 5 : 2.5;
  const bump = (delta) => setWeight((w) => Math.max(0, Number(w ?? 0) + delta));

  async function registrar() {
    if (!Number(reps)) return;
    await logSet(sessionId, entryIndex, {
      weightKg: sinCarga ? null : Number(weight ?? 0),
      reps: Number(reps),
      failed,
    });
    setFailed(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {!sinCarga && (
          <div className="flex-1">
            <span className="block text-xs text-muted mb-1">Peso (kg)</span>
            <div className="flex items-stretch gap-1">
              <button
                className="min-w-12 min-h-12 rounded-xl bg-surface-2 border border-line text-xl"
                onClick={() => bump(-step)}
                aria-label="Bajar peso"
              >
                −
              </button>
              <input
                type="number"
                inputMode="decimal"
                step={step}
                value={weight ?? ''}
                onChange={(e) => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full min-h-12 text-center rounded-xl bg-surface-2 border border-line text-lg font-semibold outline-none focus:border-accent"
              />
              <button
                className="min-w-12 min-h-12 rounded-xl bg-surface-2 border border-line text-xl"
                onClick={() => bump(step)}
                aria-label="Subir peso"
              >
                +
              </button>
            </div>
          </div>
        )}

        <div className={sinCarga ? 'flex-1' : 'w-[38%]'}>
          <span className="block text-xs text-muted mb-1">
            {exercise?.loadType === 'time' ? 'Segundos' : 'Reps'}
          </span>
          <div className="flex items-stretch gap-1">
            <button
              className="min-w-12 min-h-12 rounded-xl bg-surface-2 border border-line text-xl"
              onClick={() => setReps((r) => Math.max(0, Number(r || 0) - 1))}
              aria-label="Menos reps"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              value={reps ?? ''}
              onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full min-h-12 text-center rounded-xl bg-surface-2 border border-line text-lg font-semibold outline-none focus:border-accent"
            />
            <button
              className="min-w-12 min-h-12 rounded-xl bg-surface-2 border border-line text-xl"
              onClick={() => setReps((r) => Number(r || 0) + 1)}
              aria-label="Más reps"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1 min-h-14 text-base" onClick={registrar} disabled={!Number(reps)}>
          + Serie {entry.sets.length + 1}
          {!sinCarga && weight ? ` · ${kg(Number(weight))} × ${reps}` : ''}
        </Button>
        <button
          onClick={() => setFailed((f) => !f)}
          aria-pressed={failed}
          className={
            'min-h-14 px-4 rounded-xl border font-semibold ' +
            (failed
              ? 'bg-danger/20 text-danger border-danger/40'
              : 'bg-surface-2 text-muted border-line')
          }
        >
          Fallo
        </button>
      </div>
    </div>
  );
}

function PickerSheet({ open, title, exercises, onClose, onPick }) {
  const [q, setQ] = useState('');
  if (!open) return null;
  const term = q.trim().toLowerCase();
  const filtered = term
    ? exercises.filter((e) => e.name.toLowerCase().includes(term))
    : exercises;

  return (
    <Sheet open title={title} onClose={onClose}>
      <Input autoFocus placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 space-y-2">
        {filtered.map((ex) => (
          <li key={ex._id}>
            <button
              className="w-full text-left p-3 min-h-14 rounded-xl bg-surface-2 border border-line"
              onClick={() => onPick(ex)}
            >
              <span className="font-semibold">{ex.name}</span>
              <span className="block text-sm text-muted">
                {MUSCLE_GROUP_LABELS[ex.muscleGroup]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
