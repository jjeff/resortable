import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    // Declarations mirror `src/` at the dist root: `src/index.ts` becomes
    // `dist/index.d.ts`, `src/react/index.ts` becomes
    // `dist/react/index.d.ts`. package.json's `types` and `exports` point
    // there, and `npm run check:exports` fails the build if they ever drift
    // apart again — 3.0.0 shipped with them pointing at a `dist/types/`
    // layout this plugin had stopped producing. An explicit
    // `outDir: 'dist/types'` used to sit here and was silently ignored.
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'Sortable',
      fileName: (format) => {
        // CJS must ship as `.cjs`: package.json has `"type": "module"`, so
        // Node would parse a `.cjs.js` file as ESM and require() would
        // return an empty object.
        if (format === 'cjs') return 'sortable.cjs'
        // Map Vite/Rollup's `es` format name to the standard `.esm.js`
        // extension that package.json `module` and `exports.import` reference.
        const ext = format === 'es' ? 'esm' : format
        return `sortable.${ext}.js`
      },
      formats: ['es', 'cjs', 'umd'],
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        exports: 'named',
      },
    },
    sourcemap: true,
    minify: 'terser',
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    open: !process.env.CI,
    // PW_PORT lets parallel worktrees each serve on their own port (mirrors playwright.config.ts).
    port: Number(process.env.PW_PORT) || (process.env.CI ? 4173 : 5173),
    // Fail loudly instead of drifting to the next free port. Playwright pins
    // `baseURL` to this exact port, so a silent shift meant the suite kept
    // testing whatever was already on the original port — in a multi-worktree
    // checkout, that is another branch's dev server, and the run goes green
    // against the wrong source.
    strictPort: true,
    host: process.env.CI ? '0.0.0.0' : 'localhost',
  },
})
