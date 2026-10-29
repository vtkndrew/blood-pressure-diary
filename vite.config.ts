import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, isPreview }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  base: command === 'build' || isPreview ? '/blood-pressure-diary/' : '/',
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false, // pwa.ts owns registration and explicit update consent.
      scope: '/blood-pressure-diary/',
      includeManifestIcons: false,
      manifest: {
        id: '/blood-pressure-diary/',
        start_url: '/blood-pressure-diary/',
        scope: '/blood-pressure-diary/',
        name: 'Дневник давления и пульса',
        short_name: 'Дневник давления и пульса',
        lang: 'ru',
        description: 'Измерения, графики и история самочувствия. На вашем устройстве.',
        display: 'standalone',
        theme_color: '#f7f8f3',
        background_color: '#f7f8f3',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cacheId: 'blood-pressure-diary',
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/blood-pressure-diary(?:\/|$)/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
}));
