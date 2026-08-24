import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { bootstrap } from './db/repo.js';
import RoutinesPage from './pages/RoutinesPage.jsx';
import RoutineEditPage from './pages/RoutineEditPage.jsx';
import ExercisesPage from './pages/ExercisesPage.jsx';

const TABS = [
  { to: '/rutinas', label: 'Rutinas' },
  { to: '/ejercicios', label: 'Ejercicios' },
];

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Seed + id local. Todo local: no hay await de red en el arranque.
    bootstrap().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/rutinas" replace />} />
          <Route path="/rutinas" element={<RoutinesPage />} />
          <Route path="/rutinas/:routineId" element={<RoutineEditPage />} />
          <Route path="/ejercicios" element={<ExercisesPage />} />
          <Route path="*" element={<Navigate to="/rutinas" replace />} />
        </Routes>
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                'flex-1 text-center py-4 font-semibold ' +
                (isActive ? 'text-accent' : 'text-muted')
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
