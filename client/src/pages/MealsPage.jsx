import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MEAL_SLOTS, MEAL_SLOT_LABELS } from '@gym/shared';
import {
  deleteMeal,
  getProteinTarget,
  listMeals,
  logMeal,
  setProteinTarget,
} from '../db/trackingRepo.js';
import { isCoachEnabled, parseMeal } from '../db/sync.js';
import { Button, Card, EmptyState, Field, Input, PageTitle, Select } from '../ui/primitives.jsx';
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

// Etiqueta de la confianza que devuelve la estimacion. Se muestra porque el
// numero es una estimacion y el usuario tiene derecho a saber cuanto pesarla:
// "media" quiere decir que asumimos una porcion, no que la contamos.
const CONFIANZA = {
  alta: { texto: 'estimación con cantidades explícitas', clase: 'text-ok' },
  media: { texto: 'estimación sobre una porción típica', clase: 'text-accent-2' },
  baja: { texto: 'estimación floja, revisala', clase: 'text-warn' },
};

export default function MealsPage() {
  const meals = useLiveQuery(() => listMeals({ limit: 200 }), [], null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  // null mientras no se sabe: asi el boton no parpadea al abrir la pantalla.
  const [iaDisponible, setIaDisponible] = useState(null);
  const [estimando, setEstimando] = useState(false);
  // { confidence } cuando salio bien, { error } cuando no. Nunca los dos.
  const [aviso, setAviso] = useState(null);
  const [objetivo, setObjetivo] = useState(null);
  const [editandoObjetivo, setEditandoObjetivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    isCoachEnabled().then((ok) => vivo && setIaDisponible(ok));
    getProteinTarget().then((v) => vivo && setObjetivo(v));
    return () => {
      vivo = false;
    };
  }, []);

  async function guardarObjetivo(valor) {
    await setProteinTarget(valor);
    setObjetivo(await getProteinTarget());
    setEditandoObjetivo(false);
  }

  async function estimar() {
    setEstimando(true);
    setAviso(null);
    const est = await parseMeal(draft.description.trim());
    setEstimando(false);

    if (!est) {
      setAviso({ error: 'No se pudo estimar. Anotalo a mano.' });
      return;
    }
    // Los dos en null es una respuesta valida del modelo: el texto no describe
    // comida estimable. No es un fallo, pero para el usuario el resultado es
    // el mismo, asi que se dice igual de claro.
    if (est.kcal == null && est.proteinG == null) {
      setAviso({ error: 'No pude sacar un número de eso. Probá con más detalle.' });
      return;
    }
    setDraft((d) => ({
      ...d,
      kcal: est.kcal ?? d.kcal,
      proteinG: est.proteinG ?? d.proteinG,
    }));
    setAviso({ confidence: est.confidence });
  }

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
    setAviso(null);
    setOpen(true);
  }

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
        <PageTitle>Comidas</PageTitle>
        <Button onClick={abrir}>+ Anotar</Button>
      </header>

      {/* Objetivo de proteína. Es lo único de esta pantalla que mira hacia
          adelante: el resto es registro. Sin objetivo cargado no se muestra
          ninguna barra —una barra contra un número inventado miente. */}
      <div className="px-4 pb-3">
        {editandoObjetivo || objetivo == null ? (
          <Card tone="cyan" className="p-3.5">
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                guardarObjetivo(new FormData(e.currentTarget).get('obj'));
              }}
            >
              <div className="flex-1">
                <label
                  htmlFor="obj-prote"
                  className="block label-hud text-[10px] text-muted mb-1.5"
                >
                  Objetivo diario de proteína (g)
                </label>
                <Input
                  id="obj-prote"
                  name="obj"
                  type="number"
                  inputMode="numeric"
                  defaultValue={objetivo ?? ''}
                  placeholder="120"
                />
              </div>
              <Button type="submit" variant="cyan" className="shrink-0">
                Fijar
              </Button>
            </form>
          </Card>
        ) : (
          <button
            onClick={() => setEditandoObjetivo(true)}
            className="w-full min-h-11 text-left label-hud text-[10px] text-muted
                       active:text-accent-2 transition-colors"
          >
            objetivo {objetivo} g de proteína por día · cambiar
          </button>
        )}
      </div>

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
              <div className="flex items-baseline justify-between gap-3 mb-2.5
                              border-b border-line pb-1.5">
                <h2 className="label-hud text-[11px] text-accent text-glow-red">
                  {relativeDate(d.key)}
                </h2>
                {(d.kcal != null || d.proteinG != null) && (
                  <p className="num text-[11px] text-muted shrink-0">
                    {d.kcal != null ? `${d.kcal} kcal` : ''}
                    {d.kcal != null && d.proteinG != null ? ' · ' : ''}
                    {d.proteinG != null
                      ? `${Math.round(d.proteinG)}${objetivo ? `/${objetivo}` : ''} g prot`
                      : ''}
                  </p>
                )}
              </div>

              {objetivo && d.proteinG != null && (
                <ProteinBar gramos={d.proteinG} objetivo={objetivo} />
              )}
              <ul className="space-y-2">
                {d.items.map((m) => (
                  <li key={m._id}>
                    <Card tone="cyan" className="p-3.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="label-hud text-[9px] text-accent-2/80">
                          {MEAL_SLOT_LABELS[m.slot]}
                        </p>
                        <p className="font-semibold mt-1">{m.description}</p>
                        {(m.kcal != null || m.proteinG != null) && (
                          <p className="num text-sm text-muted mt-1">
                            {m.kcal != null ? `${m.kcal} kcal` : ''}
                            {m.kcal != null && m.proteinG != null ? ' · ' : ''}
                            {m.proteinG != null ? `${m.proteinG} g prot` : ''}
                          </p>
                        )}
                      </div>
                      <button
                        className="text-muted text-sm px-2 min-w-11 min-h-11 shrink-0 active:text-danger"
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
              onChange={(e) => {
                // El aviso habla de la descripcion anterior. Si cambia, deja
                // de ser cierto y se va.
                setAviso(null);
                setDraft({ ...draft, description: e.target.value });
              }}
              placeholder="Ej: 200 g de pollo, arroz y ensalada"
            />
          </Field>

          {/* Sin API key configurada no se ofrece: un boton que siempre falla
              es peor que no tenerlo. Mismo criterio que el analisis del coach. */}
          {iaDisponible && (
            <div>
              <Button
                type="button"
                variant="cyan"
                className="w-full"
                onClick={estimar}
                disabled={!draft.description.trim() || estimando}
              >
                {estimando ? 'Estimando…' : '▸ Estimar kcal y proteína'}
              </Button>
              {aviso && (
                <p
                  className={`text-sm mt-2 text-center ${
                    aviso.error ? 'text-warn' : CONFIANZA[aviso.confidence].clase
                  }`}
                >
                  {aviso.error ?? CONFIANZA[aviso.confidence].texto}
                </p>
              )}
            </div>
          )}

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

/**
 * Barra de proteína del día contra el objetivo.
 *
 * Verde al llegar, no antes: el punto de un objetivo es saber si lo cumpliste,
 * y una barra que se pone verde al 80 % vuelve difuso justo eso. Pasarse no se
 * castiga —comer más proteína de la que apuntaste no es un error— así que
 * arriba del 100 % se queda verde y el número lo dice.
 */
function ProteinBar({ gramos, objetivo }) {
  const pct = Math.min(100, Math.round((gramos / objetivo) * 100));
  const llego = gramos >= objetivo;
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex-1 h-1.5 bg-surface-2 border border-line overflow-hidden">
        <div
          className={`h-full transition-[width] duration-500 ${
            llego
              ? 'bg-ok shadow-[0_0_8px_0_rgba(57,255,138,0.8)]'
              : 'bg-accent-2 shadow-[0_0_8px_0_rgba(0,229,255,0.6)]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`num text-[10px] w-9 text-right shrink-0 ${llego ? 'text-ok' : 'text-muted'}`}
      >
        {Math.round((gramos / objetivo) * 100)}%
      </span>
    </div>
  );
}
