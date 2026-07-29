import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

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
        // Matches `vite.config.ts` *and* double-suffixed variants like
        // `vite.config.react.ts`, which the narrower `*.config.{js,ts}`
        // missed — they were landing in the report at 0% and dragging the
        // real number down. Mirrors the glob eslint.config.js already uses.
        '**/*.config.{js,ts}',
        '**/*.config.*.{js,ts}',
        '**/*.d.ts',
        // Type-only barrel: no runtime statements to cover.
        'src/types/index.ts',
      ],
      // NOTE: these keys must sit directly under `thresholds`. They were
      // previously nested under a `global` key, which vitest 3 does not
      // recognize — the type is `Thresholds | ({[glob: string]: ...})`, so
      // `global` was parsed as a *glob pattern*, matched zero files, and the
      // floor was silently applied to an empty set. Coverage sat at 77.71%
      // against a supposed 80% gate for the entire life of the config.
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
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
})
