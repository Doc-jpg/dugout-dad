import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Dugout Dad is a static, offline-first PWA. BASE_PATH lets the same build be
// served from a sub-path (for example GitHub Pages: /dugout-dad/) or from root.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Dugout Dad',
        short_name: 'Dugout Dad',
        description: 'Private, offline-first baseball scorekeeping and analytics',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1a12',
        theme_color: '#0f1a12',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Precache the whole app shell so it opens with no network at all.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: base + 'index.html',
        cleanupOutdatedCaches: true
      }
    })
  ],
  build: {
    target: 'es2020',
    sourcemap: false
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts']
  }
} as any);
