import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      manifest: {
        name: 'Voice Recorder',
        short_name: 'Recorder',
        description: 'Record voice memos with automatic transcription',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1a73e8',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
      'react': 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
});
