import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// Tras un deploy, un navegador que quedó con el index.html viejo pide assets
// que ya no existen. El catch-all de la SPA responde HTML y la carga del
// módulo muere con un error de MIME que no dice nada. Recargar una sola vez
// trae la versión nueva; el flag evita quedar en un bucle si el fallo es otro.
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem('recarga-por-deploy')) return;
  sessionStorage.setItem('recarga-por-deploy', '1');
  window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
