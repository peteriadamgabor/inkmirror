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
      // 'prompt' instead of 'autoUpdate': don't auto-skip-waiting behind the
      // user's back. A new SW activating mid-typing throws away pending
      // edits that haven't hit the persistence pulse yet. We surface a
      // toast and call skipWaiting only on the user's explicit click — see
      // src/ui/shared/sw-update.ts.
      registerType: 'prompt',
      injectRegister: false,
      // injectManifest: author a custom SW (src/sw.ts) so we can intercept
      // share_target POSTs and stash the shared file in the browser Cache
      // API — the only place the page can read it back from. The Cloudflare
      // Worker (src/worker.ts) is server-side and can't write to the browser
      // Cache, so this has to be a browser SW.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png}'],
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
        id: '/?source=pwa',
        name: 'InkMirror — Two hearts, one soul',
        short_name: 'InkMirror',
        description:
          'Offline-first novel writing app. Two hearts, one soul — the writer and the story.',
        lang: 'en',
        dir: 'ltr',
        categories: ['productivity', 'books', 'utilities'],
        theme_color: '#7F77DD',
        background_color: '#f5f5f4',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        start_url: '/?source=pwa',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-monochrome-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'monochrome',
          },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        screenshots: [
          {
            src: 'screenshots/picker-wide.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'InkMirror — two hearts, one soul',
          },
          {
            src: 'screenshots/editor-wide.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Editor with sentiment-aware right panel',
          },
          {
            src: 'screenshots/editor-narrow.png',
            sizes: '720x1280',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Editor on mobile',
          },
        ],
        shortcuts: [
          {
            name: 'New document',
            short_name: 'New',
            url: '/?action=new',
            icons: [{ src: 'icons/shortcut-new.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Open last document',
            short_name: 'Last',
            url: '/?action=last',
            icons: [{ src: 'icons/shortcut-last.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
        file_handlers: [
          {
            action: '/',
            accept: {
              'application/json': ['.json', '.inkmirror.json', '.inkmirror.backup.json'],
            },
          },
        ],
        share_target: {
          action: '/',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{ name: 'files', accept: ['application/json', '.json'] }],
          },
        },
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
