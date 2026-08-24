import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { buildInsights } from '@gym/shared';
import { listExercises, listRoutines } from '../db/repo.js';
import { discardSession, getActiveSession, listDoneSessions, startSession } from '../db/sessionRepo.js';
import { listBodyweight, logBodyweight, pendingWeeklyWeighIn } from '../db/trackingRepo.js';
import { Button, Card, Field, Input } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';
import { kg, relativeDate, setsLabel } from '../lib/format.js';

const SEVERITY_STYLE = {
  alta: 'border-amber-500/40 bg-amber-500/10',
  media: 'border-line bg-surface',
  info: 'border-line bg-surface',
};

export default function HomePage() {
  const navigate = useNavigate();
  const active = useLiveQuery(getActiveSession, [], null);
  const routines = useLiveQuery(listRoutines, [], null);
  const sessions = useLiveQuery(listDoneSessions, [], null);
  const exercises = useLiveQuery(listExercises, [], null);
  const bodyweight = useLiveQuery(() => listBodyweight({ limit: 60 }), [], null);
  const weighIn = useLiveQuery(pendingWeeklyWeighIn, [], null);

  const [picking, setPicking] = useState(false);
  const [weighing, setWeighing] = useState(false);
  const [kgInput, setKgInput] = useState('');

  const insights = useMemo(() => {
    if (!sessions || !exercises || !bodyweight) return [];
    return buildInsights({
      sessions,
      bodyweight,
      exercisesById: new Map(exercises.map((e) => [e._id, e])),
    });
  }, [sessions, exercises, bodyweight]);

  const ultima = sessions?.[0] ?? null;

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Hoy</h1>
        <Link to="/cuenta" className="text-sm text-muted min-h-11 flex items-center">
          Cuenta
        </Link>
      </header>

      <div className="px-4 space-y-4">
        {/* Sesion abierta: lo primero, siempre. Es a lo que volves del vestuario. */}
        {active ? (
          <Card className="p-4 border-accent/40">
            <p className="text-xs text-accent uppercase tracking-wide font-semibold">
              Entrenamiento en curso
            </p>
            <p className="font-semibold mt-1">
              {active.dayKey ? `${active.dayKey} · ` : ''}
              {active.entries.length} ejercicios · empezado {relativeDate(active.date)}
            </p>
            <div className="flex gap-2 mt-3">
              <Button className="flex-1" onClick={() => navigate(`/sesion/${active._id}`)}>
                Seguir
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm('¿Descartar el entrenamiento en curso?')) discardSession(active._id);
                }}
              >
                Descartar
              </Button>
            </div>
          </Card>
        ) : (
          <Button className="w-full min-h-14 text-base" onClick={() => setPicking(true)}>
            Empezar entrenamiento
          </Button>
        )}

        {/* Pesaje semanal: el doc pide peso los lunes, asi que el recordatorio
            aparece hasta que el pesaje de esta semana exista. */}
        {weighIn?.pending && (
          <Card className="p-4 border-amber-500/40 bg-amber-500/10">
            <p className="font-semibold">Falta el pesaje de esta semana</p>
            <p className="text-sm text-muted mt-0.5">
              {weighIn.last
                ? `Último: ${kg(weighIn.last.kg)} kg, ${relativeDate(weighIn.last.date)}.`
                : 'Todavía no registraste tu peso.'}
            </p>
            <Button className="mt-3 w-full" onClick={() => setWeighing(true)}>
              Anotar peso
            </Button>
          </Card>
        )}

        {insights.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
              Sugerencias
            </h2>
            <ul className="space-y-2">
              {insights.map((i) => (
                <li key={i.id}>
                  <div className={`rounded-2xl border p-4 ${SEVERITY_STYLE[i.severity]}`}>
                    <p className="font-semibold">{i.title}</p>
                    <p className="text-sm text-muted mt-0.5">{i.body}</p>
                    {i.exerciseId && (
                      <Link
                        to={`/progreso/${i.exerciseId}`}
                        className="text-sm text-accent mt-2 inline-block"
                      >
                        Ver progreso →
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {ultima && (
          <section>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
              Último entrenamiento
            </h2>
            <Card className="p-4">
              <p className="text-sm text-muted">{relativeDate(ultima.date)}</p>
              <ul className="mt-2 space-y-1">
                {ultima.entries.slice(0, 4).map((e, i) => (
                  <li key={i} className="text-sm">
                    {setsLabel(e.sets)}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>

      <RoutinePickerSheet
        open={picking}
        routines={routines ?? []}
        onClose={() => setPicking(false)}
        onPick={async ({ routineId, dayKey }) => {
          const s = await startSession({ routineId, dayKey });
          setPicking(false);
          navigate(`/sesion/${s._id}`);
        }}
      />

      <Sheet open={weighing} title="Peso corporal" onClose={() => setWeighing(false)}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!Number(kgInput)) return;
            await logBodyweight({ kg: Number(kgInput) });
            setKgInput('');
            setWeighing(false);
          }}
        >
          <Field label="Peso de hoy (kg)" hint="Mismo día, misma hora, en ayunas.">
            <Input
              autoFocus
              type="number"
              inputMode="decimal"
              step="0.1"
              value={kgInput}
              onChange={(e) => setKgInput(e.target.value)}
              placeholder="80,5"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={!Number(kgInput)}>
            Guardar
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

function RoutinePickerSheet({ open, routines, onClose, onPick }) {
  if (!open) return null;
  return (
    <Sheet open title="¿Qué entrenás?" onClose={onClose}>
      <div className="space-y-4">
        {routines.map((r) => (
          <div key={r._id}>
            <p className="text-sm font-semibold text-muted mb-2">{r.name}</p>
            <ul className="space-y-2">
              {r.days.map((d) => (
                <li key={d.key}>
                  <button
                    className="w-full text-left p-3 min-h-14 rounded-xl bg-surface-2 border border-line"
                    onClick={() => onPick({ routineId: r._id, dayKey: d.key })}
                  >
                    <span className="font-semibold">
                      {d.key} · {d.label}
                    </span>
                    <span className="block text-sm text-muted">
                      {d.slots.length} ejercicios
                    </span>
                  </button>
                </li>
              ))}
              {r.days.length === 0 && (
                <li className="text-sm text-muted">Esta rutina no tiene días cargados.</li>
              )}
            </ul>
          </div>
        ))}

        {/* Sin rutina tambien se entrena: el dia que la maquina esta ocupada
            o entrenas en otro gimnasio, la app no puede bloquearte. */}
        <button
          className="w-full text-left p-3 min-h-14 rounded-xl bg-surface-2 border border-line"
          onClick={() => onPick({ routineId: null, dayKey: null })}
        >
          <span className="font-semibold">Entrenamiento libre</span>
          <span className="block text-sm text-muted">Agregás los ejercicios sobre la marcha</span>
        </button>
      </div>
    </Sheet>
  );
}
