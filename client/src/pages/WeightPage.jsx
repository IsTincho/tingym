import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { bodyweightTrend } from '@gym/shared';
import { deleteBodyweight, listBodyweight, logBodyweight } from '../db/trackingRepo.js';
import { Button, Card, EmptyState, Field, Input } from '../ui/primitives.jsx';
import Sheet from '../ui/Sheet.jsx';
import { relativeDate, shortDate, kg } from '../lib/format.js';

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

  const trend = useMemo(() => bodyweightTrend(entries ?? []), [entries]);

  if (entries === null) return null;

  const pesos = entries.map((e) => e.kg);
  const min = Math.min(...pesos, Infinity);
  const max = Math.max(...pesos, -Infinity);
  const rango = max - min || 1;

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Peso</h1>
        <Button onClick={() => setOpen(true)}>Anotar</Button>
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

          <Card className="p-4 space-y-2">
            {entries.slice(0, 16).map((e) => (
              <div key={e._id} className="flex items-center gap-3">
                <span className="text-xs text-muted w-16 shrink-0">{shortDate(e.date)}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    // Escala al rango real de pesajes: con 78-82 kg, una barra
                    // desde cero seria una linea plana inutil.
                    style={{ width: `${15 + ((e.kg - min) / rango) * 85}%` }}
                  />
                </div>
                <span className="text-sm font-semibold w-20 text-right shrink-0">
                  {kg(e.kg)} kg
                </span>
              </div>
            ))}
          </Card>

          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e._id}>
                <Card className="p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{kg(e.kg)} kg</p>
                    <p className="text-sm text-muted">{relativeDate(e.date)}</p>
                  </div>
                  <button
                    className="text-muted text-sm px-3 min-h-11"
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
            await logBodyweight({ kg: Number(value) });
            setValue('');
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
      <p className="text-xs text-muted">{label}</p>
      <p className="font-bold mt-0.5">{value}</p>
    </Card>
  );
}
