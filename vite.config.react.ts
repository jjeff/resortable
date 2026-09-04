import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

/**
 * Build for the `resortable/react` subpath export.
 *
 * `react` and `resortable` are externals: the adapter must share the
 * consumer's core module instance — bundling core here would duplicate the
 * GlobalDragState/PluginSystem singletons. No UMD; script-tag users aren't
 * writing React hooks.
 */
export default defineConfig({
  plugins: [
    // Emits `dist/react/index.d.ts`, which is where package.json's
    // `exports["./react"].types` points. See the note in vite.config.ts.
    dts({
      include: ['src/react/**/*'],
    }),
  ],
  build: {
    // The main build already populated dist/ — don't wipe it.
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/react/index.ts'),
      fileName: (format) => {
        // `.cjs` because package.json's `"type": "module"` makes Node parse
        // a `.cjs.js` file as ESM, breaking require().
        if (format === 'cjs') return 'react/index.cjs'
        const ext = format === 'es' ? 'esm' : format
        return `react/index.${ext}.js`
      },
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: ['react', 'resortable'],
      output: {
        exports: 'named',
      },
    },
    sourcemap: true,
    minify: 'terser',
  },
})
