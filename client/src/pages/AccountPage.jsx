import { useEffect, useState } from 'react';
import { getMeta } from '../db/db.js';
import { changePassword, clearSession, getToken, login, register, sync } from '../db/sync.js';
import { BackLink, Button, Card, Field, Input, PageTitle } from '../ui/primitives.jsx';
import BackupPanel from '../ui/BackupPanel.jsx';
import { relativeDate } from '../lib/format.js';

function PasswordForm() {
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [estado, setEstado] = useState({ error: '', ok: false });

  if (!abierto) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setAbierto(true)}>
        Cambiar contraseña
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setEstado({ error: '', ok: false });
          try {
            await changePassword(form);
            setForm({ currentPassword: '', newPassword: '' });
            setEstado({ error: '', ok: true });
            setAbierto(false);
          } catch (err) {
            setEstado({ error: err.message, ok: false });
          }
        }}
      >
        <Field label="Contraseña actual">
          <Input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
        </Field>
        <Field label="Contraseña nueva" hint="Mínimo 8 caracteres" error={estado.error}>
          <Input
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={form.newPassword.length < 8}>
            Guardar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  const [estado, setEstado] = useState(null);
  const [modo, setModo] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [ultimaSync, setUltimaSync] = useState(null);

  async function refrescar() {
    const [token, email, last] = await Promise.all([
      getToken(),
      getMeta('userEmail'),
      getMeta('lastSyncAt'),
    ]);
    setEstado({ conectado: Boolean(token), email });
    setUltimaSync(last);
  }

  useEffect(() => {
    refrescar();
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      if (modo === 'registro') {
        await register(form);
      } else {
        await login(form);
      }
      // Primer sync inmediato: sin esto la cuenta recien creada parece vacia
      // en el otro dispositivo hasta el siguiente ciclo de background.
      await sync({ force: true }).catch(() => {});
      setForm({ email: '', password: '', name: '' });
      await refrescar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return null;

  return (
    <div>
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <BackLink to="/hoy">← Hoy</BackLink>
        <PageTitle className="mt-2">Cuenta</PageTitle>
      </header>

      <div className="px-4 space-y-4">
        {estado.conectado ? (
          <>
            <Card className="p-4">
              <p className="label-hud text-[10px] text-ok flex items-center gap-2">
                <span className="pulse-dot inline-block w-2 h-2 bg-ok rotate-45 shadow-[0_0_8px_0_rgba(57,255,138,0.9)]" />
                Sesión iniciada
              </p>
              <p className="font-display font-bold mt-2 break-all">{estado.email}</p>
              <p className="num text-sm text-muted mt-1.5">
                {ultimaSync ? `Último sync ${relativeDate(ultimaSync)}` : 'Todavía sin sincronizar'}
              </p>
            </Card>

            <Button
              className="w-full"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                setError('');
                try {
                  const r = await sync({ force: true });
                  if (r.skipped) setError(`No se sincronizó: ${r.skipped}`);
                  await refrescar();
                } catch (err) {
                  setError(err.message);
                } finally {
                  setOcupado(false);
                }
              }}
            >
              {ocupado ? '⋯ Sincronizando' : '⇅ Sincronizar ahora'}
            </Button>

            <PasswordForm />

            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                // Cerrar sesion no borra lo local: se sigue entrenando offline
                // igual, y al volver a entrar sube lo que quedo pendiente.
                if (!confirm('¿Cerrar sesión? Los datos locales se mantienen.')) return;
                await clearSession();
                await refrescar();
              }}
            >
              Cerrar sesión
            </Button>
          </>
        ) : (
          <>
            <Card tone="cyan" className="p-4">
              <p className="label-hud text-[10px] text-accent-2/80 mb-2">modo local</p>
              <p className="text-sm text-muted">
                La app funciona completa sin cuenta. Iniciar sesión sirve para tener los
                mismos datos en otro dispositivo y para las sugerencias con IA.
              </p>
            </Card>

            <div className="flex gap-2">
              {['login', 'registro'].map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setModo(m);
                    setError('');
                  }}
                  className={
                    'flex-1 min-h-12 chamfer-sm border label-hud text-[11px] ' +
                    'transition-[background-color,box-shadow,border-color] ' +
                    (modo === m
                      ? 'bg-accent text-ink border-accent glow-red'
                      : 'bg-surface text-muted border-line active:border-accent/40')
                  }
                >
                  {m === 'login' ? 'Entrar' : 'Crear cuenta'}
                </button>
              ))}
            </div>

            <form onSubmit={enviar} className="space-y-4">
              {modo === 'registro' && (
                <Field label="Nombre">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoComplete="name"
                  />
                </Field>
              )}
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                  placeholder="vos@mail.com"
                />
              </Field>
              <Field
                label="Contraseña"
                hint={modo === 'registro' ? 'Mínimo 8 caracteres' : undefined}
                error={error}
              >
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
                />
              </Field>
              <Button
                type="submit"
                className="w-full"
                disabled={ocupado || !form.email || !form.password}
              >
                {ocupado ? 'Un momento…' : modo === 'registro' ? 'Crear cuenta' : 'Entrar'}
              </Button>
            </form>
          </>
        )}

        {/* Fuera del if/else de sesión iniciada: hacer backup es MÁS urgente
            sin cuenta, no menos —sin sync este navegador es la única copia. */}
        <BackupPanel />
      </div>
    </div>
  );
}
