import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { MUSCLE_GROUP_LABELS } from '@gym/shared';
import {
  addDay,
  addSlot,
  getRoutine,
  listExercises,
  moveSlot,
  removeDay,
  removeSlot,
  renameDay,
  updateRoutine,
  updateSlot,
} from '../db/repo.js';
import { BackLink, Button, Card, EmptyState, Field, Input } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';

function restLabel(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} min`;
}

export default function RoutineEditPage() {
  const { routineId } = useParams();
  const routine = useLiveQuery(() => getRoutine(routineId), [routineId], null);
  const exercises = useLiveQuery(listExercises, [], null);

  // Una sola hoja abierta a la vez (restriccion 2.2: nada de modales anidados).
  const [sheet, setSheet] = useState(null); // {type:'day'|'picker'|'slot', ...}
  const [openDay, setOpenDay] = useState(null);

  const byId = useMemo(
    () => new Map((exercises ?? []).map((e) => [e._id, e])),
    [exercises],
  );

  if (routine === undefined) {
    return <EmptyState title="Rutina inexistente" hint="Puede que la hayas borrado." />;
  }
  if (!routine || exercises === null) return null;

  const currentDay = openDay ?? routine.days[0]?.key ?? null;
  const day = routine.days.find((d) => d.key === currentDay) ?? null;

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <BackLink to="/rutinas">← Rutinas</BackLink>
        {/* El nombre se edita en el lugar: no hay pantalla de "editar rutina". */}
        <input
          // min-h-12: es un input, no un titulo. Medía 22 px de alto y había
          // que acertarle a la línea de texto para poder renombrar.
          className="mt-2 w-full min-h-12 bg-transparent font-display font-bold text-2xl uppercase
                     tracking-[0.06em] text-glow-red outline-none border-b border-transparent
                     transition-colors focus:border-accent/60"
          value={routine.name}
          onChange={(e) => updateRoutine(routine._id, { name: e.target.value })}
          aria-label="Nombre de la rutina"
        />
      </header>

      <div className="px-4 flex gap-2 overflow-x-auto pb-3">
        {routine.days.map((d) => (
          <button
            key={d.key}
            onClick={() => setOpenDay(d.key)}
            className={
              'shrink-0 min-h-12 px-4 chamfer-sm border label-hud text-[11px] ' +
              'transition-[background-color,box-shadow,border-color] ' +
              (d.key === currentDay
                ? 'bg-accent text-ink border-accent glow-red'
                : 'bg-surface text-muted border-line active:border-accent/40')
            }
          >
            {d.key} · {d.label}
          </button>
        ))}
        <Button
          variant="secondary"
          className="shrink-0 min-h-11"
          onClick={() => setSheet({ type: 'day', label: '' })}
        >
          + Día
        </Button>
      </div>

      {routine.days.length === 0 ? (
        <EmptyState
          title="Sin días todavía"
          hint="Agregá un día (ej: espalda + hombros) y metele ejercicios."
          action={
            <Button onClick={() => setSheet({ type: 'day', label: '' })}>Agregar día</Button>
          }
        />
      ) : day ? (
        <div className="px-4 space-y-3">
          {day.slots.length === 0 && (
            <p className="label-hud text-[11px] text-muted py-8 text-center">
              // este día no tiene ejercicios
            </p>
          )}

          {day.slots.map((slot, i) => {
            const ex = byId.get(slot.exerciseId);
            return (
              <Card key={`${slot.exerciseId}-${i}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="text-left flex-1 min-w-0"
                    onClick={() => setSheet({ type: 'slot', dayKey: day.key, index: i })}
                  >
                    <p className="font-semibold flex items-baseline gap-2">
                      <span className="num text-[11px] text-muted shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate">{ex?.name ?? 'Ejercicio borrado'}</span>
                    </p>
                    <p className="num text-sm text-muted mt-1">
                      {slot.targetSets} × {slot.repRangeMin}-{slot.repRangeMax}
                      {slot.perSide ? ' por lado' : ''} · {restLabel(slot.restSeconds)} descanso
                    </p>
                    {(slot.alternativeIds ?? []).length > 0 && (
                      <p className="text-sm text-accent-2 mt-1 truncate">
                        o {slot.alternativeIds.map((id) => byId.get(id)?.name).filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {slot.note && (
                      <p className="text-sm text-muted mt-1.5 border-l-2 border-accent-3/50 pl-2.5">
                        {slot.note}
                      </p>
                    )}
                  </button>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="secondary"
                      className="min-h-11 px-3"
                      aria-label="Subir"
                      disabled={i === 0}
                      onClick={() => moveSlot(routine._id, day.key, i, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-11 px-3"
                      aria-label="Bajar"
                      disabled={i === day.slots.length - 1}
                      onClick={() => moveSlot(routine._id, day.key, i, 1)}
                    >
                      ↓
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}

          <Button
            className="w-full"
            onClick={() => setSheet({ type: 'picker', dayKey: day.key })}
          >
            + Agregar ejercicio
          </Button>

          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setSheet({ type: 'day', dayKey: day.key, label: day.label })}
            >
              Renombrar día
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                if (confirm(`¿Borrar el día "${day.label}"?`)) {
                  removeDay(routine._id, day.key);
                  setOpenDay(null);
                }
              }}
            >
              Borrar día
            </Button>
          </div>
        </div>
      ) : null}

      <DaySheet
        sheet={sheet}
        routineId={routine._id}
        onClose={() => setSheet(null)}
        onCreated={(key) => setOpenDay(key)}
      />
      <PickerSheet
        sheet={sheet}
        routineId={routine._id}
        exercises={exercises}
        onClose={() => setSheet(null)}
      />
      <SlotSheet
        sheet={sheet}
        routine={routine}
        byId={byId}
        exercises={exercises}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}

function DaySheet({ sheet, routineId, onClose, onCreated }) {
  const open = sheet?.type === 'day';
  const [label, setLabel] = useState('');
  // El sheet se desmonta al cerrar, asi que sembrar el draft una vez por
  // apertura alcanza y evita un useEffect extra.
  const [seededFor, setSeededFor] = useState(null);
  const editing = Boolean(sheet?.dayKey);

  if (open && seededFor !== sheet) {
    setSeededFor(sheet);
    setLabel(sheet.label ?? '');
  }

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    const clean = label.trim();
    if (!clean) return;
    if (editing) {
      await renameDay(routineId, sheet.dayKey, clean);
    } else {
      const r = await addDay(routineId, clean);
      onCreated(r.days[r.days.length - 1].key);
    }
    onClose();
  }

  return (
    <Sheet open title={editing ? 'Renombrar día' : 'Nuevo día'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre del día" hint="Ej: Espalda + hombros">
          <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" disabled={!label.trim()}>
          Guardar
        </Button>
      </form>
    </Sheet>
  );
}

function PickerSheet({ sheet, routineId, exercises, onClose }) {
  const open = sheet?.type === 'picker';
  const [q, setQ] = useState('');
  if (!open) return null;

  const term = q.trim().toLowerCase();
  const filtered = term
    ? exercises.filter((e) => e.name.toLowerCase().includes(term))
    : exercises;

  return (
    <Sheet open title="Agregar ejercicio" onClose={onClose}>
      <Input
        autoFocus
        placeholder="Buscar…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="mt-3 space-y-2">
        {filtered.map((ex) => (
          <li key={ex._id}>
            <button
              className="w-full text-left p-3.5 min-h-14 chamfer-sm bg-surface-2 border border-line
                         active:border-accent/60 active:glow-red-soft transition-[border-color,box-shadow]"
              onClick={async () => {
                await addSlot(routineId, sheet.dayKey, { exerciseId: ex._id });
                onClose();
              }}
            >
              <span className="font-semibold">{ex.name}</span>
              <span className="block text-sm text-muted">
                {MUSCLE_GROUP_LABELS[ex.muscleGroup]}
              </span>
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="label-hud text-[11px] text-muted py-8 text-center">
            Nada con ese nombre. Creálo en la pestaña Ejercicios.
          </li>
        )}
      </ul>
    </Sheet>
  );
}

function SlotSheet({ sheet, routine, byId, exercises, onClose }) {
  const open = sheet?.type === 'slot';
  const slot = open
    ? routine.days.find((d) => d.key === sheet.dayKey)?.slots[sheet.index]
    : null;
  const [draft, setDraft] = useState(null);
  const [seededFor, setSeededFor] = useState(null);
  const [buscar, setBuscar] = useState('');

  if (open && slot && seededFor !== sheet) {
    setSeededFor(sheet);
    setDraft({ alternativeIds: [], perSide: false, ...slot });
    setBuscar('');
  }

  if (!open || !slot || !draft) return null;

  const ex = byId.get(slot.exerciseId);
  const num = (v) => (v === '' ? '' : Number(v));

  async function save(e) {
    e.preventDefault();
    const min = Number(draft.repRangeMin) || 1;
    const max = Number(draft.repRangeMax) || min;
    await updateSlot(routine._id, sheet.dayKey, sheet.index, {
      targetSets: Number(draft.targetSets) || 1,
      // El esquema exige min <= max; ordenarlos acá evita romperle la mano
      // al usuario por tipear el rango al reves.
      repRangeMin: Math.min(min, max),
      repRangeMax: Math.max(min, max),
      restSeconds: Number(draft.restSeconds) || 0,
      perSide: Boolean(draft.perSide),
      note: draft.note ?? '',
      alternativeIds: draft.alternativeIds ?? [],
    });
    onClose();
  }

  return (
    <Sheet open title={ex?.name ?? 'Ejercicio'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Series">
            <Input
              type="number"
              inputMode="numeric"
              value={draft.targetSets}
              onChange={(e) => setDraft({ ...draft, targetSets: num(e.target.value) })}
            />
          </Field>
          <Field label="Reps mín.">
            <Input
              type="number"
              inputMode="numeric"
              value={draft.repRangeMin}
              onChange={(e) => setDraft({ ...draft, repRangeMin: num(e.target.value) })}
            />
          </Field>
          <Field label="Reps máx.">
            <Input
              type="number"
              inputMode="numeric"
              value={draft.repRangeMax}
              onChange={(e) => setDraft({ ...draft, repRangeMax: num(e.target.value) })}
            />
          </Field>
        </div>

        <Field label="Descanso (segundos)">
          <Input
            type="number"
            inputMode="numeric"
            step="15"
            value={draft.restSeconds}
            onChange={(e) => setDraft({ ...draft, restSeconds: num(e.target.value) })}
          />
        </Field>

        {/* Boton y no checkbox nativo: el checkbox de 13 px no se toca con el
            dedo, y aca todo lo tocable mide 44. */}
        <button
          type="button"
          onClick={() => setDraft({ ...draft, perSide: !draft.perSide })}
          aria-pressed={Boolean(draft.perSide)}
          className={
            'w-full min-h-12 px-3 chamfer-sm border font-display text-sm text-left ' +
            'flex items-center gap-3 transition-colors ' +
            (draft.perSide
              ? 'bg-surface-2 border-accent-2 text-accent-2'
              : 'bg-surface-2 border-line text-muted')
          }
        >
          <span
            aria-hidden
            className={
              'w-5 h-5 shrink-0 border flex items-center justify-center ' +
              (draft.perSide ? 'border-accent-2 bg-accent-2 text-ink' : 'border-line')
            }
          >
            {draft.perSide ? '✓' : ''}
          </span>
          Por lado (unilateral)
        </button>

        <Field label="Nota" hint="Ej: codo fijo, bajá lento">
          <Input
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </Field>

        {/* Alternativas: el "o" de la rutina escrita. Durante la sesión
            aparecen como botones al lado del ejercicio, así cambiar cuesta un
            tap en vez de buscar entre los 48 del catálogo con la mano sudada. */}
        <div>
          <span className="block label-hud text-[11px] text-muted mb-2">
            Alternativas
          </span>
          {(draft.alternativeIds ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2.5">
              {draft.alternativeIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="min-h-11 pl-3 pr-2 chamfer-sm bg-surface-2 border border-accent-2/40
                             font-display text-sm text-accent-2 flex items-center gap-2
                             active:border-danger active:text-danger transition-colors"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      alternativeIds: draft.alternativeIds.filter((x) => x !== id),
                    })
                  }
                  aria-label={`Sacar ${byId.get(id)?.name ?? 'alternativa'}`}
                >
                  {byId.get(id)?.name ?? 'Ejercicio borrado'}
                  <span aria-hidden className="text-base leading-none">✕</span>
                </button>
              ))}
            </div>
          )}

          {(draft.alternativeIds ?? []).length >= 4 ? (
            <p className="text-sm text-muted">
              Cuatro es el tope. Más que eso vuelve a ser un buscador.
            </p>
          ) : (
            <>
              <Input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar para agregar…"
              />
              {buscar.trim() && (
                <ul className="mt-2 max-h-52 overflow-y-auto space-y-1.5">
                  {exercises
                    .filter(
                      (e) =>
                        e._id !== draft.exerciseId &&
                        !(draft.alternativeIds ?? []).includes(e._id) &&
                        e.name.toLowerCase().includes(buscar.trim().toLowerCase()),
                    )
                    .slice(0, 8)
                    .map((e) => (
                      <li key={e._id}>
                        <button
                          type="button"
                          className="w-full text-left min-h-12 px-3 chamfer-sm bg-surface-2
                                     border border-line font-display text-sm
                                     active:border-accent-2 active:text-accent-2 transition-colors"
                          onClick={() => {
                            setDraft({
                              ...draft,
                              alternativeIds: [...(draft.alternativeIds ?? []), e._id],
                            });
                            setBuscar('');
                          }}
                        >
                          {e.name}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            Guardar
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              await removeSlot(routine._id, sheet.dayKey, sheet.index);
              onClose();
            }}
          >
            Quitar
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
