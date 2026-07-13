import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Using 'prompt' so the app can show a "New version available" toast
      // with a manual refresh action. Sprint 5 handles the update UI.
      registerType: 'prompt',
      // Manifest is served as a static file from public/manifest.json.
      // No inline manifest config needed — the static file is simpler and
      // avoids potential serialization issues with the plugin generator.
      // The icons referenced in the manifest are in public/icons/.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,woff2}'],
        runtimeCaching: [
          // API: lesson content — stale-while-revalidate (mostly static)
          {
            urlPattern: /^https?:\/\/[^/]+\/api\/courses\/[^/]+\/weeks\/[^/]+\/lesson/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'scholara-lessons',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // API: feed/questions — network first with timeout (changes frequently)
          {
            urlPattern: /^https?:\/\/[^/]+\/api\/feed\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'scholara-feed',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // API: courses list — stale-while-revalidate
          {
            urlPattern: /^https?:\/\/[^/]+\/api\/courses(\/|$)/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'scholara-courses',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Google Fonts (from index.html) — cache first
          {
            urlPattern: /^https?:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})