import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { buildInsights } from '@gym/shared';
import { listExercises, listRoutines } from '../db/repo.js';
import { discardSession, getActiveSession, listDoneSessions, startSession } from '../db/sessionRepo.js';
import { listBodyweight, logBodyweight, pendingWeeklyWeighIn } from '../db/trackingRepo.js';
import { Button, Card, Field, Input, PageTitle, SectionLabel } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';
import { kg, relativeDate, setsLabel } from '../lib/format.js';

// La severidad se lee por el neon del borde, no por un icono: de reojo,
// entre series, el color llega antes que la forma.
const SEVERITY_STYLE = {
  alta: 'border-warn/45 bg-warn/[0.07] shadow-[0_0_22px_-10px_rgba(255,176,32,0.8)]',
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
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 flex items-center justify-between">
        <div>
          <PageTitle>Hoy</PageTitle>
          <p className="label-hud text-[10px] text-muted/70 mt-1">
            {active ? '● sesión abierta' : 'sistema listo'}
          </p>
        </div>
        <Link
          to="/cuenta"
          className="label-hud text-[10px] text-muted min-h-11 px-3 flex items-center
                     border border-line chamfer-sm active:text-accent active:border-accent/50"
        >
          Cuenta
        </Link>
      </header>

      <div className="px-4 space-y-4">
        {/* Sesion abierta: lo primero, siempre. Es a lo que volves del vestuario. */}
        {active ? (
          <Card className="relative overflow-hidden p-4 border-accent/45 glow-red-soft sweep">
            <p className="label-hud text-[11px] text-accent text-glow-red flex items-center gap-2">
              <span className="pulse-dot inline-block w-2 h-2 bg-accent rotate-45 shadow-[0_0_8px_0_rgba(255,42,74,0.9)]" />
              Entrenamiento en curso
            </p>
            <p className="font-semibold mt-2">
              {active.dayKey ? `${active.dayKey} · ` : ''}
              <span className="num">{active.entries.length}</span> ejercicios · empezado{' '}
              {relativeDate(active.date)}
            </p>
            <div className="relative z-10 flex gap-2 mt-4">
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
          <Button className="w-full min-h-16 text-base" onClick={() => setPicking(true)}>
            ▸ Empezar entrenamiento
          </Button>
        )}

        {/* Pesaje semanal: el doc pide peso los lunes, asi que el recordatorio
            aparece hasta que el pesaje de esta semana exista. */}
        {weighIn?.pending && (
          <Card tone="none" className="p-4 border-warn/45 bg-warn/[0.07]">
            <p className="label-hud text-[10px] text-warn mb-1.5">pendiente</p>
            <p className="font-semibold">Falta el pesaje de esta semana</p>
            <p className="text-sm text-muted mt-1">
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
            <SectionLabel>Sugerencias</SectionLabel>
            <ul className="space-y-2">
              {insights.map((i) => (
                <li key={i.id}>
                  <div className={`chamfer border p-4 ${SEVERITY_STYLE[i.severity]}`}>
                    <p className="font-semibold">{i.title}</p>
                    <p className="text-sm text-muted mt-1">{i.body}</p>
                    {i.exerciseId && (
                      <Link
                        to={`/progreso/${i.exerciseId}`}
                        className="label-hud text-[10px] text-accent-2 text-glow-cyan mt-3 inline-block"
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
            <SectionLabel>Último entrenamiento</SectionLabel>
            <Card tone="cyan" className="p-4">
              <p className="label-hud text-[10px] text-muted">{relativeDate(ultima.date)}</p>
              <ul className="mt-2.5 space-y-1.5">
                {ultima.entries.slice(0, 4).map((e, i) => (
                  <li key={i} className="text-sm num text-text/90">
                    <span className="text-accent/60 mr-2">{String(i + 1).padStart(2, '0')}</span>
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
            <p className="label-hud text-[10px] text-accent/80 mb-2.5">{r.name}</p>
            <ul className="space-y-2">
              {r.days.map((d) => (
                <li key={d.key}>
                  <button
                    className="w-full text-left p-3.5 min-h-14 chamfer-sm bg-surface-2 border border-line
                               active:border-accent/60 active:glow-red-soft transition-[border-color,box-shadow]"
                    onClick={() => onPick({ routineId: r._id, dayKey: d.key })}
                  >
                    <span className="font-semibold">
                      <span className="font-display text-accent">{d.key}</span> · {d.label}
                    </span>
                    <span className="block text-sm text-muted mt-0.5">
                      <span className="num">{d.slots.length}</span> ejercicios
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
          className="w-full text-left p-3.5 min-h-14 chamfer-sm bg-surface-2 border border-accent-2/30
                     active:border-accent-2/70 active:glow-cyan transition-[border-color,box-shadow]"
          onClick={() => onPick({ routineId: null, dayKey: null })}
        >
          <span className="font-semibold text-accent-2">Entrenamiento libre</span>
          <span className="block text-sm text-muted mt-0.5">
            Agregás los ejercicios sobre la marcha
          </span>
        </button>
      </div>
    </Sheet>
  );
}
