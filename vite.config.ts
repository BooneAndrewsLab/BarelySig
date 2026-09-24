/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import pkg from './package.json' with { type: 'json' };

/**
 * Deployment base path, e.g. "/BarelySig/" for GitHub Pages under a repo.
 * Set BASE_PATH in the environment at build time; defaults to the root.
 */
const base = process.env['BASE_PATH'] ?? '/';

export default defineConfig({
  base,
  define: {
    // So a user or a bug report can say which release they are on.
    // package.json is the one place it is written.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
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
