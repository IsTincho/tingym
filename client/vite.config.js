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
      // Las fuentes no van acá: viven en public/, así que salen en dist y las
      // levanta el globPatterns de abajo. Listarlas duplicaría la entrada.
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'TINGYM — registro de entrenamiento',
        short_name: 'TINGYM',
        description: 'Registro de entrenamientos que funciona sin señal.',
        theme_color: '#05060a',
        background_color: '#05060a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Todo el shell precacheado: el subsuelo del gimnasio no tiene señal.
        //
        // Ojo con agregar `jpg` acá: las fotos de ejercicios son 45 × 2 y
        // ~5,8 MB. Precachearlas convierte un arranque de 450 KB en uno de
        // seis megas, y la PWA se instalaría bajando fotos de ejercicios que
        // quizá nunca mires. Van por runtimeCaching, abajo.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        // El shell entra en el precache; las fotos no. Sin este techo,
        // workbox avisa recién en build y es fácil no leerlo.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // CacheFirst y no StaleWhileRevalidate: el contenido es inmutable
            // (la foto de una sentadilla no cambia), así que revalidar sólo
            // gastaría la señal que justamente no hay.
            urlPattern: ({ url }) => url.pathname.startsWith('/exercises/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos-ejercicios',
              expiration: {
                // 45 ejercicios × 2 fotos, con aire para cuando crezca el
                // catálogo. El techo existe para que la cache no sea infinita
                // en un teléfono lleno, no porque esperemos llegar.
                maxEntries: 140,
                maxAgeSeconds: 60 * 60 * 24 * 180,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // El workspace @gym/shared es ESM crudo: que Vite lo compile en vez de
  // pre-bundlearlo evita tener que rebuildear al tocar los esquemas.
  optimizeDeps: { exclude: ['@gym/shared'] },
});
