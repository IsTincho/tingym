import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { aggregateSessions, detectPlateau, totalVolume } from '@gym/shared';
import { listExercises } from '../db/repo.js';
import { listDoneSessions } from '../db/sessionRepo.js';
import { Card, EmptyState } from '../ui/primitives.jsx';
import { monthLabel, relativeDate, shortDate, weekLabel, kg } from '../lib/format.js';

const PERIODS = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

export default function ProgressPage() {
  const sessions = useLiveQuery(listDoneSessions, [], null);
  const exercises = useLiveQuery(listExercises, [], null);
  const [period, setPeriod] = useState('week');

  const byId = useMemo(
    () => new Map((exercises ?? []).map((e) => [e._id, e])),
    [exercises],
  );

  const buckets = useMemo(
    () => aggregateSessions(sessions ?? [], period),
    [sessions, period],
  );

  // Ranking de ejercicios por uso, con el ultimo peso tope y si esta planchado.
  const porEjercicio = useMemo(() => {
    const mapa = new Map();
    for (const s of sessions ?? []) {
      for (const e of s.entries) {
        const done = e.sets.filter((x) => Number(x.reps) > 0);
        if (done.length === 0) continue;
        const item = mapa.get(e.exerciseId) ?? {
          exerciseId: e.exerciseId,
          sessions: 0,
          lastDate: s.date,
          lastTop: null,
          historial: [],
        };
        item.sessions += 1;
        item.historial.push({ date: s.date, sets: done });
        if (s.date >= item.lastDate) {
          item.lastDate = s.date;
          const pesos = done.filter((x) => x.weightKg != null).map((x) => x.weightKg);
          item.lastTop = pesos.length ? Math.max(...pesos) : null;
        }
        mapa.set(e.exerciseId, item);
      }
    }
    return [...mapa.values()]
      .map((i) => ({ ...i, plateau: detectPlateau(i.historial).plateau }))
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [sessions]);

  if (sessions === null || exercises === null) return null;

  if (sessions.length === 0) {
    return (
      <div>
        <Header />
        <EmptyState
          title="Sin entrenamientos terminados"
          hint="Terminá una sesión y el seguimiento empieza acá."
        />
      </div>
    );
  }

  const label = { day: shortDate, week: weekLabel, month: monthLabel }[period];

  return (
    <div>
      <Header />

      <div className="px-4 flex gap-2 pb-3">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={
              'flex-1 min-h-11 rounded-xl border font-semibold ' +
              (period === p.key
                ? 'bg-accent text-ink border-accent'
                : 'bg-surface text-muted border-line')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        <ul className="space-y-2">
          {buckets.slice(0, 12).map((b) => (
            <li key={b.key}>
              <Card className="p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{label(b.from)}</p>
                  <p className="text-sm text-muted">
                    {b.sessions} {b.sessions === 1 ? 'sesión' : 'sesiones'}
                  </p>
                </div>
                <div className="flex gap-4 mt-2 text-sm">
                  <span>
                    <span className="text-muted">volumen </span>
                    <span className="font-semibold">{kg(Math.round(b.volumeKg))} kg</span>
                  </span>
                  <span>
                    <span className="text-muted">series </span>
                    <span className="font-semibold">{b.sets}</span>
                  </span>
                  <span>
                    <span className="text-muted">ejercicios </span>
                    <span className="font-semibold">{b.exercises}</span>
                  </span>
                </div>
                {/* Barra proporcional al bucket mas alto. Es una regla de
                    referencia, no un grafico: el anti-alcance descarta charts. */}
                <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{
                      width: `${Math.round(
                        (b.volumeKg / Math.max(...buckets.map((x) => x.volumeKg), 1)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <section className="pt-2">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
            Por ejercicio
          </h2>
          <ul className="space-y-2">
            {porEjercicio.map((i) => (
              <li key={i.exerciseId}>
                <Link to={`/progreso/${i.exerciseId}`}>
                  <Card className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {byId.get(i.exerciseId)?.name ?? 'Ejercicio'}
                      </p>
                      <p className="text-sm text-muted">
                        {i.sessions} {i.sessions === 1 ? 'sesión' : 'sesiones'} ·{' '}
                        {relativeDate(i.lastDate)}
                        {i.plateau && <span className="text-amber-300"> · planchado</span>}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold">
                      {i.lastTop != null ? `${kg(i.lastTop)} kg` : '—'}
                    </span>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
      <h1 className="text-2xl font-bold">Progreso</h1>
    </header>
  );
}
