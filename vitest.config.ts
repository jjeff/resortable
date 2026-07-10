import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        'legacy-sortable/',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    include: ['tests/unit/**/*.{test,spec}.{js,ts,tsx}'],
    exclude: ['tests/e2e/**/*'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Self-reference used by src/react so the built adapter externalizes
      // to the package name while tests exercise live source.
      resortable: resolve(__dirname, 'src/index.ts'),
    },
  },
});