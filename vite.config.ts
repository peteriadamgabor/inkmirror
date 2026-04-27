import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const HF_BASE = 'https://huggingface.co';

// Build identity — baked in via define at build time, surfaced to the app
// as __APP_VERSION__ / __APP_COMMIT__ / __APP_BUILT_AT__. Cloudflare/CI
// supplies the commit SHA via CF_PAGES_COMMIT_SHA or GITHUB_SHA; locally
// we ask git. The semantic version comes straight from package.json.
function resolveCommit(): string {
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const PKG = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};
const APP_VERSION = PKG.version;
const APP_COMMIT = resolveCommit();
const APP_BUILT_AT = new Date().toISOString();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
    __APP_BUILT_AT__: JSON.stringify(APP_BUILT_AT),
  },
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
