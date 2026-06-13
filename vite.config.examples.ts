import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync } from 'fs';

// Multi-page build for the showcase + dev playground + curated examples.
//
// This config is SEPARATE from the library build (`vite.config.ts`). It
// produces a static site at `docs/demo/` that gh-pages serves alongside the
// TypeDoc-generated API reference at `docs/api/`. The library build emits
// `dist/sortable.{esm,cjs,umd}.js` — that's a different artifact with
// incompatible Vite options (`build.lib` vs `build.rollupOptions.input`).
//
// Pages bundled:
// - `index.html` (polished showcase at repo root) → `docs/demo/index.html`
// - `playground.html` (bare API harness) → `docs/demo/playground.html`
// - Each `examples/*.html` → `docs/demo/examples/<name>.html`
//
// Excluded:
// - `examples/simple-list.html` and `examples/multi-list.html` import from
//   `../dist/sortable.esm.js`, which the docs workflow does not build. They
//   are E2E test fixtures (referenced by `tests/e2e/animation*.spec.ts`) and
//   are intentionally left untouched here.

const examplesDir = resolve(__dirname, 'examples');
const EXCLUDED_EXAMPLES = new Set(['simple-list.html', 'multi-list.html']);

const exampleHtmlFiles = readdirSync(examplesDir)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => !EXCLUDED_EXAMPLES.has(f));

const input: Record<string, string> = {
  // Polished showcase at the root of /demo/
  main: resolve(__dirname, 'index.html'),
  // Bare-bones dev playground at /demo/playground.html
  playground: resolve(__dirname, 'playground.html'),
};
for (const file of exampleHtmlFiles) {
  const name = file.replace(/\.html$/, '');
  input[`examples/${name}`] = resolve(examplesDir, file);
}

export default defineConfig({
  // Relative asset URLs so the bundle works under any subpath
  // (gh-pages serves it at /resortable/demo/).
  base: './',
  build: {
    outDir: 'docs/demo',
    emptyOutDir: true,
    rollupOptions: { input },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
