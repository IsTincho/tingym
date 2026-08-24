import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  LOAD_TYPES,
  LOAD_TYPE_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  PATTERNS,
} from '@gym/shared';
import { createExercise, deleteExercise, listExercises } from '../db/repo.js';
import { Button, Card, Field, Input, Select } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';

const EMPTY = {
  name: '',
  muscleGroup: 'espalda',
  pattern: 'pull',
  loadType: 'dumbbell',
  notes: '',
};

export default function ExercisesPage() {
  const exercises = useLiveQuery(listExercises, [], null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState('');

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (exercises ?? []).filter(
      (e) => !term || e.name.toLowerCase().includes(term),
    );
    return MUSCLE_GROUPS.map((g) => ({
      key: g,
      items: list.filter((e) => e.muscleGroup === g),
    })).filter((g) => g.items.length > 0);
  }, [exercises, q]);

  async function submit(e) {
    e.preventDefault();
    try {
      await createExercise(draft);
      setDraft(EMPTY);
      setError('');
      setCreating(false);
    } catch (err) {
      setError(err?.issues?.[0]?.message ?? 'No se pudo guardar');
    }
  }

  if (exercises === null) return null;

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ejercicios</h1>
        <Button onClick={() => setCreating(true)}>Nuevo</Button>
      </header>

      <div className="px-4 pb-3">
        <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="px-4 space-y-5">
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
              {MUSCLE_GROUP_LABELS[g.key]}
            </h2>
            <ul className="space-y-2">
              {g.items.map((ex) => (
                <li key={ex._id}>
                  <Card className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{ex.name}</p>
                      <p className="text-sm text-muted">
                        {LOAD_TYPE_LABELS[ex.loadType]}
                        {ex.notes ? ` · ${ex.notes}` : ''}
                      </p>
                    </div>
                    {/* Solo se borran los propios: el catalogo global es compartido. */}
                    {ex.ownerId && (
                      <Button
                        variant="ghost"
                        className="shrink-0 px-3"
                        onClick={() => {
                          if (confirm(`¿Borrar "${ex.name}"?`)) deleteExercise(ex._id);
                        }}
                      >
                        Borrar
                      </Button>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="text-muted text-sm py-6 text-center">Nada con ese nombre.</p>
        )}
      </div>

      <Sheet open={creating} title="Nuevo ejercicio" onClose={() => setCreating(false)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nombre" error={error}>
            <Input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ej: Remo en punta"
            />
          </Field>
          <Field label="Grupo muscular">
            <Select
              value={draft.muscleGroup}
              onChange={(e) => setDraft({ ...draft, muscleGroup: e.target.value })}
            >
              {MUSCLE_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {MUSCLE_GROUP_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Patrón">
              <Select
                value={draft.pattern}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
              >
                {PATTERNS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Carga">
              <Select
                value={draft.loadType}
                onChange={(e) => setDraft({ ...draft, loadType: e.target.value })}
              >
                {LOAD_TYPES.map((l) => (
                  <option key={l} value={l}>
                    {LOAD_TYPE_LABELS[l]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Nota de técnica" hint="Opcional">
            <Input
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={!draft.name.trim()}>
            Crear
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
