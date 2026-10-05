import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Makes this a proper installable PWA: adds the manifest, a service worker
// that caches the app shell, and auto-updates when you deploy a new version.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'favicon.ico'],
      manifest: {
        name: 'Dave Academy',
        short_name: 'Dave Academy',
        description: 'Student, payment, attendance and rankings management for Dave Academy',
        theme_color: '#2948d2',
        background_color: '#f5f6f8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Dedicated safe-zone-aware maskable icon (see scripts/generate-icons.mjs) -
          // no longer reusing the plain 512 icon, which had no inset margin for
          // the OS's own mask-shape crop.
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the app shell so it still opens (with last-saved data) if
        // there's no signal - handy on a phone between classes.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
  },
});
