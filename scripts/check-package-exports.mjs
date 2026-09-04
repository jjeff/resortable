#!/usr/bin/env node
/**
 * Verify that every file `package.json` promises to publish actually exists.
 *
 * Written after 3.0.0 shipped with `exports["./react"].types` pointing at
 * `dist/types/react/index.d.ts`, a file that no longer existed: the
 * vite-plugin-dts major upgrade changed where declarations land (mirroring
 * `src/` at the dist root rather than under `dist/types/`) and the manifest
 * was never updated. Consumers of `resortable/react` got no types at all, so
 * `useSortable` resolved to `any` and every property read off its events
 * became a lint error in their build — with nothing in ours to show for it.
 *
 * Nothing else checks this. The build succeeds, the bundle-size job succeeds,
 * the unit and e2e suites run against `src/`, and the published artifact is
 * the one thing no test ever loads.
 *
 * Run after `npm run build`.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

/** Every value in `obj` that looks like a path into the package. */
function collect(value, path, out) {
  if (typeof value === 'string') {
    if (value.startsWith('./') || value.startsWith('dist/')) {
      out.push({ path, target: value })
    }
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collect(v, `${path}[${i}]`, out))
    return out
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, `${path}.${k}`, out)
  }
  return out
}

const targets = []
for (const field of [
  'main',
  'module',
  'unpkg',
  'types',
  'exports',
  'typesVersions',
]) {
  if (pkg[field] !== undefined) collect(pkg[field], field, targets)
}

const missing = targets.filter(
  ({ target }) => !existsSync(resolve(root, target))
)

if (missing.length > 0) {
  console.error(
    `\npackage.json promises ${missing.length} file(s) that the build did not produce:\n`
  )
  for (const { path, target } of missing) {
    console.error(`  ${path}\n    → ${target}`)
  }
  console.error(
    '\nEither the manifest is stale or the build output moved. Both have ' +
      'happened; check where the declarations actually landed before ' +
      'changing the build.\n'
  )
  process.exit(1)
}

console.log(`package exports: ${targets.length} declared paths, all present`)
