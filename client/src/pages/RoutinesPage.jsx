import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listRoutines, createRoutine, deleteRoutine } from '../db/repo.js';
import { Button, Card, EmptyState, Field, Input } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';

export default function RoutinesPage() {
  const routines = useLiveQuery(listRoutines, [], null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  async function submit(e) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    await createRoutine({ name: clean });
    setName('');
    setCreating(false);
  }

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rutinas</h1>
        <div className="flex items-center gap-3">
          <Link to="/ejercicios" className="text-sm text-muted min-h-11 flex items-center">
            Ejercicios
          </Link>
          <Button onClick={() => setCreating(true)}>Nueva</Button>
        </div>
      </header>

      {routines === null ? null : routines.length === 0 ? (
        <EmptyState
          title="Todavía no hay rutinas"
          hint="Una rutina son tus días de entrenamiento con ejercicios y rangos objetivo."
          action={<Button onClick={() => setCreating(true)}>Crear rutina</Button>}
        />
      ) : (
        <ul className="px-4 space-y-3">
          {routines.map((r) => {
            const slots = r.days.reduce((n, d) => n + d.slots.length, 0);
            return (
              <li key={r._id}>
                <Card className="flex items-stretch">
                  <Link to={`/rutinas/${r._id}`} className="flex-1 p-4 min-h-16">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-sm text-muted mt-0.5">
                      {r.days.length} {r.days.length === 1 ? 'día' : 'días'} · {slots}{' '}
                      {slots === 1 ? 'ejercicio' : 'ejercicios'}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    className="px-4 rounded-l-none"
                    aria-label={`Borrar ${r.name}`}
                    onClick={() => {
                      if (confirm(`¿Borrar la rutina "${r.name}"?`)) deleteRoutine(r._id);
                    }}
                  >
                    Borrar
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={creating} title="Nueva rutina" onClose={() => setCreating(false)}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nombre" hint="Ej: 4 días — espalda y hombros">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la rutina"
            />
          </Field>
          <Button type="submit" className="w-full" disabled={!name.trim()}>
            Crear
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
