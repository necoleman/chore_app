import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_BASE_PATH is set to /chore_app/ in the GitHub Actions workflow.
// Defaults to / for local dev so localhost:5173/ still works.
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      // injectManifest lets us write our own sw.js that includes both
      // Workbox precaching and the FCM background message handler.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      manifest: {
        name: 'Family Chores',
        short_name: 'Chores',
        description: 'Track household chores for the whole family',
        display: 'standalone',
        start_url: base,
        background_color: '#ffffff',
        theme_color: '#16a34a',
        icons: [
          {
            src: base + 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: base + 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
