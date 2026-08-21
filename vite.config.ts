import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Batwa — your money, kept',
        short_name: 'Batwa',
        description:
          'Your bank texts, kept as a ledger. Automatic PKR expense tracking from bank SMS.',
        // The live meta tag is swapped per theme in theme.tsx, but the manifest
        // value is read once at install time — so it tracks the light ground.
        theme_color: '#f5f2e9',
        background_color: '#f5f2e9',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Home-screen shortcuts land here once /quick-add and /inbox exist
        // (Phase 2) — an entry pointing at a missing route is worse than none.
      },
      workbox: {
        // Precache the shell only. Supabase responses are user data behind
        // RLS and must never touch the cache — no runtimeCaching for them.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
