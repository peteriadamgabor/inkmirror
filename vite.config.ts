import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const HF_BASE = 'https://huggingface.co';

export default defineConfig({
  server: {
    proxy: {
      '/hf-proxy': {
        target: HF_BASE,
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/hf-proxy/, ''),
        headers: {
          'User-Agent': 'InkMirror/1.0',
        },
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['access-control-allow-origin'] = '*';
            proxyRes.headers['access-control-allow-methods'] = 'GET, HEAD, OPTIONS';
            proxyRes.headers['access-control-allow-headers'] = '*';
            proxyRes.headers['access-control-expose-headers'] = '*';
          });
          proxy.on('error', (err, _req, res) => {
            console.error('[hf-proxy] error:', err.message);
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'hf-proxy failed', message: err.message }));
            }
          });
        },
      },
    },
  },
  plugins: [
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg}'],
        // Heavy chunks are fetched on demand — don't precache them.
        globIgnores: [
          '**/ai-worker-*.js',
          '**/ort-wasm-*.wasm',
          '**/jszip*.js',
          '**/jspdf*.js',
          '**/html2canvas*.js',
          '**/docx*.js',
          '**/index.es-*.js',
          '**/purify.es-*.js',
        ],
      },
      manifest: {
        name: 'InkMirror',
        short_name: 'InkMirror',
        description:
          'Offline-first novel writing app. Two hearts, one soul — the writer and the story.',
        theme_color: '#7F77DD',
        background_color: '#f5f5f4',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, './src/engine'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
});
