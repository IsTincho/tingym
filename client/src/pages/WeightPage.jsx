import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  MEASUREMENTS,
  MEASUREMENT_LABELS,
  bodyweightTrend,
  hasMeasurements,
} from '@gym/shared';
import { deleteBodyweight, listBodyweight, logBodyweight } from '../db/trackingRepo.js';
import { Button, Card, EmptyState, Field, Input, PageTitle, SectionLabel } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';
import { relativeDate, shortDate, kg, cm } from '../lib/format.js';

const TREND_LABEL = {
  subiendo: 'Subiendo',
  bajando: 'Bajando',
  estable: 'Estable',
  sin_datos: 'Sin datos',
};

export default function WeightPage() {
  const entries = useLiveQuery(() => listBodyweight({ limit: 120 }), [], null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  // Plegado por defecto: las medidas son una vez por mes y el pesaje es
  // semanal. Mostrar cuatro campos vacios en cada anotada es pedirle al
  // usuario que los ignore doce veces por cada vez que los usa.
  const [conMedidas, setConMedidas] = useState(false);
  const [medidas, setMedidas] = useState({});

  const trend = useMemo(() => bodyweightTrend(entries ?? []), [entries]);

  if (entries === null) return null;

  // Los dos ultimos pesajes que trajeron medidas. El delta entre ellos es lo
  // que realmente contesta "¿estoy creciendo?", que es la pregunta de fondo:
  // el propio plan dice que la balanza es mala herramienta con este objetivo.
  const conCinta = entries.filter((e) => hasMeasurements(e.measurements));
  const ultimaMedida = conCinta[0] ?? null;
  const previaMedida = conCinta[1] ?? null;

  const pesos = entries.map((e) => e.kg);
  const min = Math.min(...pesos, Infinity);
  const max = Math.max(...pesos, -Infinity);
  const rango = max - min || 1;

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
        <PageTitle>Peso</PageTitle>
        <Button onClick={() => setOpen(true)}>+ Anotar</Button>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          title="Sin pesajes"
          hint="Pesate los lunes, misma hora, en ayunas. Comparar días sueltos mide el asado del domingo, no la tendencia."
          action={<Button onClick={() => setOpen(true)}>Anotar peso</Button>}
        />
      ) : (
        <div className="px-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Actual" value={`${kg(entries[0].kg)} kg`} />
            <Stat label="Tendencia" value={TREND_LABEL[trend.trend]} />
            <Stat
              label="Cambio"
              value={
                trend.trend === 'sin_datos'
                  ? '—'
                  : `${trend.deltaKg > 0 ? '+' : ''}${kg(Number(trend.deltaKg.toFixed(1)))} kg`
              }
            />
          </div>

          {ultimaMedida && (
            <Card className="p-4">
              <SectionLabel>Medidas · {relativeDate(ultimaMedida.date)}</SectionLabel>
              <div className="grid grid-cols-2 gap-2.5">
                {MEASUREMENTS.filter((k) => ultimaMedida.measurements?.[k] != null).map((k) => {
                  const actual = ultimaMedida.measurements[k];
                  const antes = previaMedida?.measurements?.[k] ?? null;
                  const delta = antes == null ? null : Number((actual - antes).toFixed(1));
                  return (
                    <div key={k} className="bg-surface-2 border border-line chamfer-sm p-2.5">
                      <p className="label-hud text-[9px] text-muted">{MEASUREMENT_LABELS[k]}</p>
                      <p className="num font-bold mt-1">
                        {cm(actual)}
                        <span className="text-muted text-xs font-normal"> cm</span>
                      </p>
                      {/* El delta lleva signo y flecha: el color solo no
                          alcanza para decir si subio o bajo. */}
                      {delta != null && delta !== 0 && (
                        <p className={`num text-[11px] mt-0.5 ${delta > 0 ? 'text-ok' : 'text-warn'}`}>
                          {delta > 0 ? '▲ +' : '▼ '}
                          {cm(Math.abs(delta))} cm
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card tone="cyan" className="p-4 space-y-2.5">
            <SectionLabel>Serie</SectionLabel>
            {entries.slice(0, 16).map((e) => (
              <div key={e._id} className="flex items-center gap-3">
                <span className="num text-[10px] text-muted w-14 shrink-0">
                  {shortDate(e.date)}
                </span>
                <div className="flex-1 h-2 bg-surface-2 border border-line overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent-2 to-accent
                               shadow-[0_0_10px_0_rgba(0,229,255,0.6)]"
                    // Escala al rango real de pesajes: con 78-82 kg, una barra
                    // desde cero seria una linea plana inutil.
                    style={{ width: `${15 + ((e.kg - min) / rango) * 85}%` }}
                  />
                </div>
                <span className="num text-sm font-bold w-20 text-right shrink-0">
                  {kg(e.kg)}
                  <span className="text-muted text-xs font-normal"> kg</span>
                </span>
              </div>
            ))}
          </Card>

          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e._id}>
                <Card tone="none" className="p-3.5 flex items-center justify-between">
                  <div>
                    <p className="num font-bold text-lg text-accent text-glow-red">
                      {kg(e.kg)}
                      <span className="text-muted text-xs font-normal"> kg</span>
                    </p>
                    <p className="label-hud text-[10px] text-muted mt-0.5">
                      {relativeDate(e.date)}
                      {hasMeasurements(e.measurements) && (
                        <span className="text-accent-2"> · con cinta</span>
                      )}
                    </p>
                  </div>
                  <button
                    className="text-muted text-sm px-3 min-w-11 min-h-11 active:text-danger"
                    onClick={() => deleteBodyweight(e._id)}
                    aria-label="Borrar pesaje"
                  >
                    ✕
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Sheet open={open} title="Anotar peso" onClose={() => setOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!Number(value)) return;
            await logBodyweight({ kg: Number(value), measurements: medidas });
            setValue('');
            setMedidas({});
            setConMedidas(false);
            setOpen(false);
          }}
        >
          <Field label="Peso (kg)" hint="Mismo día de la semana, misma hora.">
            <Input
              autoFocus
              type="number"
              inputMode="decimal"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="80,5"
            />
          </Field>
          {/* Divulgacion progresiva: el boton abre los cuatro campos solo el
              dia que toca medirse. */}
          {conMedidas ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {MEASUREMENTS.map((k) => (
                  <Field key={k} label={`${MEASUREMENT_LABELS[k]} (cm)`}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={medidas[k] ?? ''}
                      onChange={(e) => setMedidas({ ...medidas, [k]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
              <p className="text-sm text-muted">
                Dejá vacío lo que no midas. Misma cinta, mismo punto, sin apretar.
              </p>
            </div>
          ) : (
            <Button
              type="button"
              variant="cyan"
              className="w-full"
              onClick={() => setConMedidas(true)}
            >
              + Sumar medidas con cinta
            </Button>
          )}

          <Button type="submit" className="w-full" disabled={!Number(value)}>
            Guardar
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <Card className="p-3 text-center">
      <p className="label-hud text-[9px] text-muted">{label}</p>
      <p className="num font-bold mt-1.5 text-accent text-glow-red">{value}</p>
    </Card>
  );
}
