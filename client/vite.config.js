import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // El puerto viene por env para poder convivir con otros dev servers.
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Gym — registro de entrenamiento',
        short_name: 'Gym',
        description: 'Registro de entrenamientos que funciona sin señal.',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Todo el shell precacheado: el subsuelo del gimnasio no tiene señal.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  // El workspace @gym/shared es ESM crudo: que Vite lo compile en vez de
  // pre-bundlearlo evita tener que rebuildear al tocar los esquemas.
  optimizeDeps: { exclude: ['@gym/shared'] },
});
