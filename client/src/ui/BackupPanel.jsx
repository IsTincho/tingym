import { useRef, useState } from 'react';
import { exportarTodo, importar } from '../db/backup.js';
import { Button, Card, SectionLabel } from './primitives.jsx';

const nombreArchivo = () =>
  `tingym-${new Date().toISOString().slice(0, 10)}.json`;

/**
 * Copia de seguridad local.
 *
 * Va en Cuenta y no en una pantalla propia porque es lo mismo que el sync
 * —poner los datos a salvo de este dispositivo—, sólo que a mano y sin
 * servidor. Quien entra acá ya está pensando en eso.
 */
export default function BackupPanel() {
  const [estado, setEstado] = useState(null); // { tipo, texto }
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);

  async function exportar() {
    setOcupado(true);
    setEstado(null);
    try {
      const backup = await exportarTodo();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombreArchivo();
      a.click();
      // Sin esto el blob queda en memoria hasta recargar la página.
      URL.revokeObjectURL(url);
      const total = Object.values(backup.datos).reduce((n, x) => n + x.length, 0);
      setEstado({ tipo: 'ok', texto: `${total} registros exportados` });
    } catch (e) {
      setEstado({ tipo: 'error', texto: e.message ?? 'No se pudo exportar' });
    } finally {
      setOcupado(false);
    }
  }

  async function alElegirArchivo(e) {
    const file = e.target.files?.[0];
    // El input se limpia siempre: si no, elegir el mismo archivo dos veces
    // seguidas no dispara el evento y parece que la app se colgó.
    e.target.value = '';
    if (!file) return;

    setOcupado(true);
    setEstado(null);
    try {
      const json = JSON.parse(await file.text());
      const r = await importar(json);
      const total = Object.values(r.importados).reduce((n, x) => n + x, 0);
      const detalle = Object.entries(r.importados)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`)
        .join(' · ');
      setEstado({
        tipo: r.rechazados.length ? 'aviso' : 'ok',
        texto: r.rechazados.length
          ? `${total} importados, ${r.rechazados.length} rechazados: ${r.rechazados[0].error}`
          : `${total} importados — ${detalle}`,
      });
    } catch (err) {
      setEstado({ tipo: 'error', texto: err.message ?? 'Archivo inválido' });
    } finally {
      setOcupado(false);
    }
  }

  const color =
    estado?.tipo === 'error'
      ? 'text-danger'
      : estado?.tipo === 'aviso'
        ? 'text-warn'
        : 'text-ok';

  return (
    <Card tone="cyan" className="p-4">
      <SectionLabel>Copia de seguridad</SectionLabel>
      <p className="text-sm text-muted mb-3">
        Todo vive en este navegador. Si no sincronizás, un “borrar datos de
        sitio” se lleva el historial entero.
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" disabled={ocupado} onClick={exportar}>
          Exportar
        </Button>
        <Button
          variant="cyan"
          className="flex-1"
          disabled={ocupado}
          onClick={() => inputRef.current?.click()}
        >
          Importar
        </Button>
      </div>
      {/* El input nativo se oculta y lo dispara el botón: `file` no se puede
          estilar y un botón de 12 px no se toca con el dedo. */}
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={alElegirArchivo}
      />
      {estado && (
        <p className={`text-sm mt-2.5 ${color}`} role="status">
          {estado.texto}
        </p>
      )}
    </Card>
  );
}
