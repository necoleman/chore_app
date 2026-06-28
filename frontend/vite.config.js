import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

// VITE_BASE_PATH is set to /chore_app/ in the GitHub Actions workflow.
// Defaults to / for local dev so localhost:5173/ still works.
const base = process.env.VITE_BASE_PATH || '/';

// Stamp the build with the package version and a UTC build time so the running
// app can display which version it is — handy for confirming a deploy landed.
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const buildTime = new Date().toISOString();

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
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
