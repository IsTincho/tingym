import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { bootstrap } from './db/repo.js';
import { startBackgroundSync } from './db/sync.js';
import HomePage from './pages/HomePage.jsx';
import SessionPage from './pages/SessionPage.jsx';
import ProgressPage from './pages/ProgressPage.jsx';
import ExerciseDetailPage from './pages/ExerciseDetailPage.jsx';
import RoutinesPage from './pages/RoutinesPage.jsx';
import RoutineEditPage from './pages/RoutineEditPage.jsx';
import ExercisesPage from './pages/ExercisesPage.jsx';
import WeightPage from './pages/WeightPage.jsx';
import MealsPage from './pages/MealsPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import {
  IconComidas,
  IconHoy,
  IconPeso,
  IconProgreso,
  IconRutinas,
} from './ui/icons.jsx';

// Icono Y etiqueta, no uno de los dos. El icono da el blanco grande para el
// pulgar y se reconoce de reojo; la etiqueta es la que evita adivinar qué
// significa el dibujo. Cinco es el tope de una barra inferior.
const TABS = [
  { to: '/hoy', label: 'Hoy', Icon: IconHoy },
  { to: '/progreso', label: 'Progreso', Icon: IconProgreso },
  { to: '/rutinas', label: 'Rutinas', Icon: IconRutinas },
  { to: '/comidas', label: 'Comidas', Icon: IconComidas },
  { to: '/peso', label: 'Peso', Icon: IconPeso },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    // Seed + id local. Todo local: no hay await de red en el arranque.
    let detener = () => {};
    bootstrap().then(() => {
      setReady(true);
      // El sync arranca despues del bootstrap y corre en background: la UI
      // nunca espera a la red para dejarte anotar.
      detener = startBackgroundSync();
    });
    return () => detener();
  }, []);

  // Entrenando, la barra estorba: la pantalla de sesion va a pantalla completa.
  const enSesion = pathname.startsWith('/sesion/');

  if (!ready) return null;

  return (
    <div className="min-h-full flex flex-col">
      <main className={enSesion ? 'flex-1 pb-6' : 'flex-1 pb-20'}>
        <Routes>
          <Route path="/" element={<Navigate to="/hoy" replace />} />
          <Route path="/hoy" element={<HomePage />} />
          <Route path="/sesion/:sessionId" element={<SessionPage />} />
          <Route path="/progreso" element={<ProgressPage />} />
          <Route path="/progreso/:exerciseId" element={<ExerciseDetailPage />} />
          <Route path="/rutinas" element={<RoutinesPage />} />
          <Route path="/rutinas/:routineId" element={<RoutineEditPage />} />
          <Route path="/ejercicios" element={<ExercisesPage />} />
          <Route path="/comidas" element={<MealsPage />} />
          <Route path="/peso" element={<WeightPage />} />
          <Route path="/cuenta" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/hoy" replace />} />
        </Routes>
      </main>

      {!enSesion && (
        <nav
          className="fixed bottom-0 inset-x-0 z-40 bg-ink-2/92 backdrop-blur-md
                     border-t border-accent/25 pb-[env(safe-area-inset-bottom)]
                     shadow-[0_-1px_18px_-6px_rgba(255,42,74,0.55)]"
        >
          <div className="flex">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  'relative flex-1 text-center py-2.5 min-h-14 flex flex-col items-center ' +
                  'justify-center gap-1 font-display font-bold uppercase text-[10px] ' +
                  'tracking-[0.06em] transition-colors ' +
                  (isActive ? 'text-accent text-glow-red' : 'text-muted active:text-text')
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Filete superior: marca la pestana activa sin robarle
                        alto a la etiqueta. */}
                    <span
                      className={
                        'absolute top-0 left-1/2 -translate-x-1/2 h-[2px] transition-all ' +
                        (isActive
                          ? 'w-8 bg-accent shadow-[0_0_10px_1px_rgba(255,42,74,0.9)]'
                          : 'w-0 bg-transparent')
                      }
                    />
                    <t.Icon
                      className={
                        'w-[22px] h-[22px] shrink-0 transition-[filter] ' +
                        (isActive ? 'drop-shadow-[0_0_6px_rgba(255,42,74,0.8)]' : '')
                      }
                    />
                    {t.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
