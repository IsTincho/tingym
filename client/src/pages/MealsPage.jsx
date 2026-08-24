import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from '@gym/shared';
import { deleteMeal, listMeals, logMeal } from '../db/trackingRepo.js';
import { Button, Card, EmptyState, Field, Input, Select } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';
import { relativeDate, startOfDay } from '../lib/format.js';

const EMPTY = { slot: 'almuerzo', description: '', kcal: '', proteinG: '' };

// Sugerencia de franja segun la hora: a las 9 de la manana casi siempre es
// desayuno, y elegirlo a mano cada vez es un tap de mas.
function slotSugerido(now = new Date()) {
  const h = now.getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'merienda';
  if (h < 23) return 'cena';
  return 'snack';
}

export default function MealsPage() {
  const meals = useLiveQuery(() => listMeals({ limit: 200 }), [], null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);

  // Agrupado por dia, mas nuevo primero.
  const dias = useMemo(() => {
    const mapa = new Map();
    for (const m of meals ?? []) {
      const key = startOfDay(m.date).toISOString();
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key).push(m);
    }
    return [...mapa.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => {
        const conKcal = items.filter((i) => i.kcal != null);
        const conProte = items.filter((i) => i.proteinG != null);
        return {
          key,
          items: items.sort((a, b) => a.date.localeCompare(b.date)),
          kcal: conKcal.length ? conKcal.reduce((a, i) => a + i.kcal, 0) : null,
          proteinG: conProte.length ? conProte.reduce((a, i) => a + i.proteinG, 0) : null,
        };
      });
  }, [meals]);

  if (meals === null) return null;

  function abrir() {
    setDraft({ ...EMPTY, slot: slotSugerido() });
    setOpen(true);
  }

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Comidas</h1>
        <Button onClick={abrir}>Anotar</Button>
      </header>

      {dias.length === 0 ? (
        <EmptyState
          title="Sin comidas registradas"
          hint="Es un diario, no un contador: anotá qué comiste. Las calorías y la proteína son opcionales."
          action={<Button onClick={abrir}>Anotar comida</Button>}
        />
      ) : (
        <div className="px-4 space-y-4">
          {dias.map((d) => (
            <section key={d.key}>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
                  {relativeDate(d.key)}
                </h2>
                {(d.kcal != null || d.proteinG != null) && (
                  <p className="text-xs text-muted">
                    {d.kcal != null ? `${d.kcal} kcal` : ''}
                    {d.kcal != null && d.proteinG != null ? ' · ' : ''}
                    {d.proteinG != null ? `${Math.round(d.proteinG)} g prot` : ''}
                  </p>
                )}
              </div>
              <ul className="space-y-2">
                {d.items.map((m) => (
                  <li key={m._id}>
                    <Card className="p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-muted uppercase tracking-wide">
                          {MEAL_SLOT_LABELS[m.slot]}
                        </p>
                        <p className="font-semibold">{m.description}</p>
                        {(m.kcal != null || m.proteinG != null) && (
                          <p className="text-sm text-muted mt-0.5">
                            {m.kcal != null ? `${m.kcal} kcal` : ''}
                            {m.kcal != null && m.proteinG != null ? ' · ' : ''}
                            {m.proteinG != null ? `${m.proteinG} g prot` : ''}
                          </p>
                        )}
                      </div>
                      <button
                        className="text-muted text-sm px-2 min-h-11 shrink-0"
                        onClick={() => deleteMeal(m._id)}
                        aria-label="Borrar comida"
                      >
                        ✕
                      </button>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet open={open} title="Anotar comida" onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!draft.description.trim()) return;
            await logMeal(draft);
            setOpen(false);
          }}
        >
          <Field label="Momento">
            <Select
              value={draft.slot}
              onChange={(e) => setDraft({ ...draft, slot: e.target.value })}
            >
              {MEAL_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {MEAL_SLOT_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Qué comiste">
            <Input
              autoFocus
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Ej: 200 g de pollo, arroz y ensalada"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kcal" hint="Opcional">
              <Input
                type="number"
                inputMode="numeric"
                value={draft.kcal}
                onChange={(e) => setDraft({ ...draft, kcal: e.target.value })}
              />
            </Field>
            <Field label="Proteína (g)" hint="Opcional">
              <Input
                type="number"
                inputMode="numeric"
                value={draft.proteinG}
                onChange={(e) => setDraft({ ...draft, proteinG: e.target.value })}
              />
            </Field>
          </div>
          <Button type="submit" className="w-full" disabled={!draft.description.trim()}>
            Guardar
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
