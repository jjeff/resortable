# Migrating from Sortable.js v1 to Resortable v2.0.0-alpha.1

This guide is for users with a working Sortable.js v1.x codebase porting to Resortable v2.

Jump to:

- [At a glance](#at-a-glance)
- [Install](#install)
- [Plugin imports are now explicit](#plugin-imports-are-now-explicit)
- [Option renames and signature changes](#option-renames-and-signature-changes)
- [Deprecated and removed callbacks](#deprecated-and-removed-callbacks)
- [Breaking changes](#breaking-changes)
- [CSS class compatibility](#css-class-compatibility)
- [Before and after recipes](#before-and-after-recipes)
- [Things that intentionally diverge](#things-that-intentionally-diverge)
- [Status of in-progress parity](#status-of-in-progress-parity)

> All deltas in this document are verified against `legacy-sortable/src/Sortable.js` defaults (line 361) and `src/types/index.ts` (`SortableOptions`).

---

## At a glance

Resortable v2 is a TypeScript-first ESM rewrite of Sortable.js. Most v1 option shapes (`group`, `animation`, `handle`, `filter`, `ghostClass`, `chosenClass`, callback names, event payload shape) carry over unchanged, so simple integrations move with little more than an import change. What changed: package is ESM-first with no `window.Sortable` global; types ship in-package (no `@types/sortablejs`); plugins must be explicitly imported and mounted; a few options were renamed (`fallbackOffset.x` → `fallbackOffsetX`); one v1 option was dropped (`supportPointer`); function-form `filter` and `direction` are not supported; the `Sortable.utils` helper surface shrank from ~13 helpers to 3; and three option defaults silently changed (`animation`, `easing`, `draggable`).

## Install

```bash
npm install resortable
```

v2 has no `dist/Sortable.min.js` UMD that auto-attaches `window.Sortable`. Import it:

```js
// v1
// <script src="Sortable.min.js"></script>
// const sortable = Sortable.create(el, { /* ... */ });

// v2
import { Sortable } from 'resortable';
const sortable = new Sortable(el, { /* ... */ });
```

ESM, CommonJS, and UMD bundles are published; see `package.json` `exports`. The UMD build exists for `<script>` users but `window.Sortable` is not part of the documented API — prefer the ESM import.

`Sortable.create(el, options)` is **not** provided in v2. Use `new Sortable(el, options)` everywhere.

## Plugin imports are now explicit

In v1, AutoScroll and OnSpill were bundled into the default build and self-registered; MultiDrag and Swap were in the "complete" build. In v2, every plugin is opt-in.

```js
// v1 — default build auto-registered AutoScroll + OnSpill
// <script src="Sortable.min.js"></script>
// Sortable.mount(new MultiDrag(), new Swap()); // for the extras
```

```ts
// v2
import { Sortable } from 'resortable';
import {
  AutoScrollPlugin,
  OnSpillPlugin,
  SwapPlugin,
} from 'resortable/plugins';

Sortable.mount([
  AutoScrollPlugin.create(),
  OnSpillPlugin.create(),
  SwapPlugin.create(),
]);

const sortable = new Sortable(el, { /* ... */ });
sortable.usePlugin('AutoScroll');
sortable.usePlugin('OnSpill');
sortable.usePlugin('Swap');
```

Or register everything in one call:

```ts
import { registerAllPlugins } from 'resortable/plugins';
registerAllPlugins();
```

### MultiDrag is built into the core — do not mount the plugin

In v1, MultiDrag was a separate plugin you mounted. In v2, multi-item selection and drag are native:

```js
// v1
Sortable.mount(new MultiDrag());
new Sortable(el, { multiDrag: true, selectedClass: 'sortable-selected' });
```

```ts
// v2 — no plugin needed
new Sortable(el, { multiDrag: true, selectedClass: 'sortable-selected' });
```

`MultiDragPlugin` was previously exported as a deprecated no-op shim for v1 back-compat. It was **removed in #34** — there is no `MultiDragPlugin` export in current builds. If you were importing `MultiDragPlugin` (even just to mount it), delete the import and the `Sortable.mount(...)` call; the `multiDrag: true` option is everything you need.

### AutoScroll plugin renamed and re-optioned

The plugin `name` changed from `'scroll'` to `'AutoScroll'`, and every option name changed:

| v1 (`Sortable.mount(new AutoScroll())`) | v2 (`AutoScrollPlugin.create({...})`) |
| --- | --- |
| `scroll: true \| HTMLElement \| Function` | (always on when plugin is installed) |
| `scrollSensitivity: 30` | `sensitivity: 100` |
| `scrollSpeed: 10` | `speed: 10` |
| `bubbleScroll: true` | _(no equivalent)_ |
| _(no equivalent)_ | `scrollX`, `scrollY`, `maxSpeed`, `acceleration` |

`sortable.usePlugin('scroll')` will not find anything — use `'AutoScroll'`.

## Option renames and signature changes

Only the **delta** is shown. Every option not listed here works the same as v1.

| v1 option | v2 equivalent | Notes |
| --- | --- | --- |
| `fallbackOffset: { x, y }` | `fallbackOffsetX: number` + `fallbackOffsetY: number` | Two scalar options instead of an object. See `src/types/index.ts:369-375`. |
| `direction: 'vertical' \| 'horizontal' \| Function` | `direction: 'vertical' \| 'horizontal'` | Function form is not supported. See `src/types/index.ts:333`. |
| `filter: string \| Function` | `filter: string` | Function form is not supported; v2 calls `eventTarget.matches(filter)` directly. See `src/core/DragManager.ts:1566`. |
| `ignore: 'a, img'` | `ignore: string` | Implemented in v2 with the same default `'a, img'` for legacy parity (issue #30). Pass `ignore: ''` to disable the default. Target-only match: a comma-separated CSS selector is checked against the pointer-down `event.target` and aborts drag-initiation when matched, so links and images keep their native click / drag behaviour. |
| `supportPointer: boolean` | _(removed)_ | Pointer events are feature-detected; no user-facing opt-out. |
| `animation` default `0` | `animation` default `150` | If your v1 code omitted `animation` and you want the legacy no-animation behavior, set `animation: 0` explicitly. |
| `easing` default `null` | `easing` default `'cubic-bezier(0.4, 0.0, 0.2, 1)'` | Set `easing: ''` (or any falsy value) to opt out if you relied on `null`. |
| `draggable` default `'>li'` (for `ul`/`ol`) or `'>*'` | `draggable` default `'.sortable-item'` | **Most impactful default change.** Any v1 code that omitted `draggable` and relied on `>li`/`>*` will silently match nothing in v2 unless items have `.sortable-item`. |
| `touchStartThreshold` default `devicePixelRatio` | `touchStartThreshold` default `5` | Set explicitly if you want the v1 behavior. |
| `Sortable.utils` (~13 helpers) | `Sortable.utils.on`, `.index`, `.insertAt` only | See [Breaking changes](#breaking-changes). |

### Verified-unchanged options

These v1 options work the same in v2 (same name, same shape, same semantics):

`group`, `sort`, `disabled`, `store`, `handle`, `delay`, `delayOnTouchOnly`, `swapThreshold`, `invertSwap`, `invertedSwapThreshold`, `dataIdAttr`, `ghostClass`, `chosenClass`, `dragClass`, `forceFallback`, `fallbackClass`, `fallbackOnBody`, `fallbackTolerance`, `dragoverBubble`, `dropBubble`, `emptyInsertThreshold`, `preventOnFilter`, `setData`.

## Deprecated and removed callbacks

Every v1 callback is preserved in v2 by name and shape with the following exceptions:

| v1 | Status in v2 | Migration |
| --- | --- | --- |
| `onMove(evt, originalEvent)` | Preserved with widened return type | v1 returned `false \| -1 \| 1 \| void`. v2 types now express this as `boolean \| -1 \| 1 \| void`. Existing handlers compile unchanged. See CHANGELOG #33. |
| `onSpill` | Preserved, but requires `OnSpillPlugin` to be mounted and installed | Same callback, but in v1 the default build registered OnSpill automatically. In v2 you must mount it. |
| `removeCloneOnHide` | Accepted but is a **no-op** in v2 | Resortable does not yet implement clone hide/show cycles — clones are always created on drag start and removed on drag end. The option is accepted to avoid breaking v1 configs but has no effect. Tracked in issue #44. |
| `revertClone` (on `group`) | Typed but **not implemented** | The setter on `SortableGroup.revertClone` is honored by `GroupManager.shouldRevertClone()`, but no caller consumes that flag. Behavior is "no revert". |

There is one v2-only callback with no v1 equivalent:

- `onSelect(event)` — fires when items are selected/deselected (multi-drag).

## Breaking changes

- **Drop `Sortable.create(el, options)`.** Use `new Sortable(el, options)`. No factory shim is provided.
- **Drop `window.Sortable` global.** Import from `'resortable'` (ESM) or `require('resortable')` (CJS). The UMD build exists but is not the documented entry point.
- **Drop `@types/sortablejs` dependency.** Types ship in-package — remove `@types/sortablejs` from your `devDependencies`.
- **Drop IE support and any browser more than ~2 years old.** Browser UA sniffing was replaced with feature detection; the `supportPointer` opt-out is gone.
- **`Sortable.utils` shrank from ~13 helpers to 3.** Only `on`, `index`, and `insertAt` are exposed (see `src/index.ts:126-133`). Removed: `off`, `css`, `find`, `bind`, `is`, `closest`, `clone`, `toggleClass`, `detectDirection`, `getChild`, `expando`. If you depend on any of these, use a DOM helper of your choice (e.g. native `Element.matches`, `Element.closest`, `getComputedStyle`).
- **Plugins must be mounted explicitly.** Even AutoScroll and OnSpill, which were in the v1 default build.
- **AutoScroll plugin renamed (`'scroll'` → `'AutoScroll'`) and re-optioned.** No alias is provided. See the AutoScroll table above.
- **MultiDrag plugin removed.** The `MultiDragPlugin` v1-compat shim (previously deprecated no-op) is gone. Use `{ multiDrag: true }` on the instance instead. Removed in #34.
- **`filter` no longer accepts a function.** String selector only.
- **`direction` no longer accepts a function.** `'vertical' \| 'horizontal'` only.
- **`ignore` option supported with legacy default `'a, img'`.** Restored in v2 (issue #30). Pass `ignore: ''` to disable.
- **Default value changes** for `animation`, `easing`, `draggable`, and `touchStartThreshold` — see the rename table above. The `draggable` change is the most likely to bite: v1 defaulted to `>li`/`>*` based on container tag; v2 defaults to `.sortable-item` regardless. Always set `draggable` explicitly to be safe.

## CSS class compatibility

All v1 CSS hooks are preserved with the same default class names:

| Class | v1 default | v2 default | Status |
| --- | --- | --- | --- |
| `ghostClass` | `sortable-ghost` | `sortable-ghost` | unchanged |
| `chosenClass` | `sortable-chosen` | `sortable-chosen` | unchanged |
| `dragClass` | `sortable-drag` | `sortable-drag` | unchanged |
| `fallbackClass` | `sortable-fallback` | `sortable-fallback` | unchanged |
| `selectedClass` (multi-drag) | `sortable-selected` | `sortable-selected` | unchanged |

v2 adds two new class hooks:

| Class | v2 default | Purpose |
| --- | --- | --- |
| `focusClass` | `sortable-focused` | Applied to the focused item during keyboard navigation (accessibility). |
| _(internal)_ | `sortable-disabled` | Toggled on the container when `option('disabled', true)` is called. |

No CSS class was renamed.

## Before and after recipes

### 1. Basic sortable list

```js
// v1
const sortable = Sortable.create(document.getElementById('list'), {
  animation: 150,
  onEnd: (evt) => console.log(evt.oldIndex, evt.newIndex),
});
```

```ts
// v2
import { Sortable } from 'resortable';

const sortable = new Sortable(document.getElementById('list')!, {
  animation: 150,
  draggable: '.sortable-item', // v2 default — set explicitly if items don't match
  onEnd: (evt) => console.log(evt.oldIndex, evt.newIndex),
});
```

_Changes_: `Sortable.create` → `new Sortable`, explicit ESM import, set `draggable` explicitly because the default changed from `>li`/`>*` to `.sortable-item`.

### 2. Shared groups (drag between lists)

```js
// v1
Sortable.create(listA, { group: 'shared' });
Sortable.create(listB, { group: 'shared' });
```

```ts
// v2
import { Sortable } from 'resortable';

new Sortable(listA, { group: 'shared', draggable: '.sortable-item' });
new Sortable(listB, { group: 'shared', draggable: '.sortable-item' });
```

_Changes_: import + constructor only. `group` shape (string or `{ name, pull, put }`) is unchanged.

### 3. Handle + filter

```js
// v1
Sortable.create(list, {
  handle: '.drag-handle',
  filter: '.no-drag, input, button',
  preventOnFilter: true,
  onFilter: (evt) => console.log('blocked', evt.target),
});
```

```ts
// v2
import { Sortable } from 'resortable';

new Sortable(list, {
  draggable: '.sortable-item',
  handle: '.drag-handle',
  filter: '.no-drag, input, button',
  preventOnFilter: true,
  onFilter: (evt) => console.log('blocked', evt.target),
});
```

_Changes_: none in the option shapes — but note `filter` no longer accepts a function. If you passed a function in v1, convert it to a CSS selector or handle the test inside `onFilter`.

### 4. Clone mode (`pull: 'clone'`)

```js
// v1
Sortable.create(palette, {
  group: { name: 'paint', pull: 'clone', put: false },
  sort: false,
});
Sortable.create(canvas, {
  group: { name: 'paint', pull: false, put: true },
});
```

```ts
// v2
import { Sortable } from 'resortable';

new Sortable(palette, {
  draggable: '.sortable-item',
  group: { name: 'paint', pull: 'clone', put: false },
  sort: false,
});
new Sortable(canvas, {
  draggable: '.sortable-item',
  group: { name: 'paint', pull: false, put: true },
});
```

_Changes_: same option shape. Note: `group.revertClone` is accepted by the type but currently has no runtime effect — clones do not revert to their source position.

### 5. Multi-drag

```js
// v1
import MultiDrag from 'sortablejs/modular/sortable.complete.esm.js';
Sortable.mount(new MultiDrag());

Sortable.create(list, {
  multiDrag: true,
  selectedClass: 'sortable-selected',
});
```

```ts
// v2 — no plugin mount needed
import { Sortable } from 'resortable';

new Sortable(list, {
  draggable: '.sortable-item',
  multiDrag: true,
  selectedClass: 'sortable-selected',
  // v2-only: callback for selection changes
  onSelect: (evt) => console.log('selection changed', evt.items),
});
```

_Changes_: drop the plugin mount entirely — multi-drag is native. The `MultiDragPlugin` v1-compat shim was removed in #34, so an `import { MultiDragPlugin } from 'resortable/plugins'` will now fail at build time. Delete the import and the `Sortable.mount(...)` call.

## Things that intentionally diverge

The following deviations are deliberate design choices, not gaps:

- **No `window.Sortable` global as a documented entry point.** v2 is ESM-first. The UMD bundle exists for `<script>` users, but the documented contract is `import { Sortable } from 'resortable'`. See `sortable-rewrite-implementation-plan.md`.
- **No `Sortable.create()` factory.** A single `new Sortable()` form is simpler to type and document; the factory was redundant.
- **No `supportPointer` option.** Pointer event support is feature-detected — the v1 UA-sniffing fallback (Safari quirks, iOS exceptions) was replaced with capability gates per the implementation plan. Users do not need (and should not have) an opt-out.
- **No function form for `filter` / `direction`.** Strings cover the overwhelming majority of use cases and keep the type surface tight. If you need dynamic per-event logic, handle it in `onMove` (return `false` to cancel) or in `onFilter`.
- **Smaller `Sortable.utils`.** Modern browsers ship `Element.matches`, `Element.closest`, `getComputedStyle`, `classList.toggle`, etc. Re-exporting wrappers around them added bytes without adding value.
- **MultiDrag is core, not a plugin.** Per the implementation plan: "take a MultiDrag-first approach to selection and dragging. Single-item drag can be simply treated as a multi-item drag with one item." Pushing this into core eliminated a class of plugin/core coupling bugs.
- **Drop IE and >2-year-old browsers.** Frees the codebase from polyfills and UA branching.

## Status of in-progress parity

A handful of v1 options are typed and accepted but not yet fully wired (e.g. `removeCloneOnHide`, `group.revertClone`). These are tracked under the [v1.x parity master tracker (#44)](https://github.com/jjeff/resortable/issues/44). Behavior of accepted-but-unwired options is documented above and in TSDoc.

If you hit a v1 behavior that v2 silently drops and it isn't called out here, please open an issue.
