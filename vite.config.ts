/// <reference types="vitest/config" />
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import lock from './src/engine/lock.json' with { type: 'json' };

import pkg from './package.json' with { type: 'json' };

/**
 * Deployment base path, e.g. "/BarelySig/" for GitHub Pages under a repo.
 * Set BASE_PATH in the environment at build time; defaults to the root.
 */
const base = process.env['BASE_PATH'] ?? '/';

/**
 * WebR looks for package index files (PACKAGES.rds, PACKAGES.gz) that
 * `webr:fetch` doesn't generate (only the plain-text PACKAGES); a real
 * repository 404s for them, and WebR falls back to the text file. Vite's
 * dev server instead serves index.html for any missing path (its SPA
 * fallback), which WebR can't tell apart from a real file: it fails to
 * parse the index instead of trying the next one, and package installs
 * fail as if the repo were empty. The PWA's own fallback already
 * excludes /webr/ in production (`navigateFallbackDenylist` above); this
 * is the same fix for the dev server, answering with a real 404 instead.
 */
function webrStatic404(): Plugin {
  return {
    name: 'webr-static-404',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? '';
        if (path.startsWith(`${base}webr/`)) {
          const file = join(process.cwd(), 'public', decodeURIComponent(path.slice(base.length)));
          if (!existsSync(file)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base,
  define: {
    // So a user or a bug report can say which release they are on.
    // package.json is the one place it is written.
    __APP_VERSION__: JSON.stringify(pkg.version),
    // The WebR cache in use, so older ones can be cleared (src/ui/pwa.ts).
    __WEBR_CACHE__: JSON.stringify(`webr-${lock.webr}`),
  },
  plugins: [
    react(),
    webrStatic404(),
    VitePWA({
      // Registered by hand in main.tsx, production only.
      injectRegister: null,
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'icons/*.png'],
      manifest: {
        name: 'BarelySig',
        short_name: 'BarelySig',
        description:
          'Statistics and graphs for lab data, in the browser. Works offline; your data stay on your computer.',
        theme_color: '#201e1d',
        background_color: '#f3f2f2',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        file_handlers: [{ action: base, accept: { 'application/json': ['.bsig'] } }],
      },
      workbox: {
        // The app shell is precached; WebR is not (tens of MB would hold up
        // the worker's install) but cached on first use, below (item 04).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['webr/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/webr\//],
        runtimeCaching: [
          {
            // A RegExp, not a function: the worker gets the pattern as a
            // literal, where a function would lose `base` (it is serialised).
            urlPattern: new RegExp(
              `^https?://[^/]+${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}webr/`,
            ),
            handler: 'CacheFirst',
            options: {
              // Named after the WebR version: an upgrade starts a new cache.
              cacheName: `webr-${lock.webr}`,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    // Model / analysis tests run in plain Node. Component tests opt into the
    // DOM with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    // Serves public/webr/repo for WebR under Node (src/test/webrNode.ts).
    globalSetup: ['./src/test/globalSetup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
    },
  },
});
