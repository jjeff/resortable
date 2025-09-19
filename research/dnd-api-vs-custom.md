# Drag and Drop for a SortableJS Rewrite: Native API vs. Custom Pointer Engine

## TL;DR

- **Build your core on Pointer Events** (custom engine) for control, performance, mobile, multi-touch, and
  accessibility.
- **Add a thin Native DnD adapter** for OS-level interop (drag to desktop/other apps, accepting file drops).

---

## Side-by-Side Summary

| Dimension                             | Native Drag & Drop API                                                                 | Custom Pointer/Touch (Pointer Events)                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Cross-window / OS drag**            | ✅ Can leave window; OS drag manager takes over; `DataTransfer` payload to other apps. | ❌ Stops at window edge (no global pointer). Need messaging for your own windows; no OS payloads. |
| **Mobile & multi-touch**              | ❌ Spotty; touch rarely fires native DnD.                                              | ✅ First-class (multi-touch, pens, gestures, long-press).                                         |
| **Control & UX fidelity**             | ⚠️ Limited lifecycle control; browser decides a lot.                                   | ✅ Full control: thresholds, handles, axis lock, snapping, grids, inertial feel, constraints.     |
| **Performance**                       | ⚠️ Harder to guarantee FLIP/rAF; native drag image separate from DOM.                  | ✅ rAF + transforms; measured FLIP layouts; predictable.                                          |
| **Accessibility (A11y)**              | ⚠️ No built-in keyboard sorting semantics.                                             | ✅ Implement keyboard “pick up/move/drop,” ARIA live announcements, focus control.                |
| **Virtualization & large lists**      | ⚠️ Challenging; measuring during native drag is limited.                               | ✅ Integrates with your virtualizer; fine-grained measuring and caching.                          |
| **Shadow DOM / iframes / transforms** | ⚠️ Quirks across browsers.                                                             | ✅ You own event retargeting & math (matrices, zoom, RTL).                                        |
| **File/URL payloads to other apps**   | ✅ `DataTransfer` (`text/uri-list`, `DownloadURL` in Chromium).                        | ❌ Not possible on the web.                                                                       |
| **Accepting external file drops**     | ✅ Straightforward via `dragover/drop` + `DataTransfer.files`.                         | ⚠️ You can detect and hand off to native, but still rely on native drop.                          |
| **Security / sandboxing**             | ✅ Browser-mediated; safe defaults.                                                    | ✅ You’re in control; still sandboxed by browser.                                                 |
| **Testing & determinism**             | ⚠️ Synthetic `DragEvent` is limited; tricky to automate.                               | ✅ Deterministic pointer sequences; easy to unit/E2E test.                                        |
| **API surface for users**             | Simple for basic cases; less composable.                                               | Composable (sensors/strategies); richer but more to learn.                                        |

---

## What Native DnD Gives You That’s Hard Elsewhere

- **OS-level drag session:** cursor leaves the window; drag image follows globally.
- **Cross-app payloads:** other apps receive your `DataTransfer` data (e.g., URLs, files).
- **Inbound file drops:** the simplest way for users to drop files from Finder/Explorer.

**Limits:** during a native drag you lose normal `pointermove/mousemove`; you only get `dragover/enter/leave/drop` at
recognized targets. Touch often doesn’t start native DnD.

---

## What a Custom Pointer Engine Unlocks

- **Unified input:** Pointer Events cover mouse, touch, pen; multi-touch & chorded gestures.
- **UX fidelity:** long-press to start, drag handles, axis lock, snapping, collision strategies (swap, nearest center,
  overlap area), auto-scroll, constraints.
- **High performance:** rAF scheduling, FLIP animations (`transform: translate3d`), measurement caching.
- **A11y you can guarantee:** keyboard drag, ARIA live announcements, roving tabindex, focus preservation.
- **Advanced layouts:** nested containers, grids, RTL/zoom/scales, Shadow DOM, virtualized lists.

**Limits:** no true OS cross-app drags on the web; can’t hand the desktop an actual file purely with JS.

---

## Recommended Hybrid Architecture

**Core (always on):**

- **Pointer sensor** (primary), with optional mouse/touch fallbacks for old browsers.
- **Engine**: selection model (single/multi), thresholds, measurement cache, collision strategies, auto-scroll, FLIP
  animations.
- **A11y**: keyboard pick/move/drop, live announcements, focus policy.

**Native adapter (opt-in on desktop):**

- **Inbound:** when `dragenter/over` has files, pause pointer engine; read `DataTransfer.files`.
- **Outbound (web):** expose a special “export” handle with `draggable=true`; on `dragstart`, populate:
  - `text/plain`, `text/uri-list` for URLs.
  - Chromium legacy: `DownloadURL = "<mime>:<filename>:<url>"` to enable drag-to-desktop for downloads.
  - `setDragImage(previewEl, x, y)` for ghost.

**Handoff logic (mouse-only desktop):**

- If user starts on an “export handle” (or holds a modifier like ⌥), **cancel** pointer drag immediately and let native
  `dragstart` proceed.
- Otherwise, run the pointer engine.

---

## Accessibility Checklist (for the custom engine)

- **Keyboard drag:** Space = pick up/drop; Arrow keys = move; PageUp/Down = jump; Home/End = extremes; Esc = cancel.
- **Live announcements:** “Picked up X. Current position 3 of 10. Moved before Y.”
- **Roles & focus:** `role="listbox"/"option"` (or `list/listitem`) with roving tabindex; maintain focus on the dragged
  item.
- **Touch targets & handles:** visible handles; `touch-action: none` on handles; `{ passive:false }` for move listeners
  to allow `preventDefault()`.

---

## Performance Playbook (custom engine)

- **Measurements:** batch reads/writes; cache `getBoundingClientRect()`; re-measure on rAF.
- **Animation:** FLIP with `transform` only; avoid layout thrash; configurable easing/duration.
- **Auto-scroll:** detect nearest scrollable ancestor + window; velocity based on proximity.
- **Virtualization:** expose a measurement hook to host virtualizers; re-measure on mount/unmount.

---

## Edge Cases to Design For

- Text selection & inputs (require handle/long-press to start).
- Shadow DOM retargeting; iframe boundaries (optionally forward events).
- Zoom/scale/RTL (matrix math, not assumptions).
- Multi-drag (track multiple active pointers and selections).
- Grouping & constraints (containment, grid packing vs swap).

---

## Security & Interop Notes

- **You cannot synthesize a trusted `DataTransfer`** or programmatically start a native drag on the web; only in
  response to user action (or via Electron’s `startDrag`).
- For “drag out” of generated content on the web, prefer hosted URLs or Blob URLs + `DownloadURL` (Chromium), and
  **always** provide a **Download** button fallback.

---

## When to Prefer Each

**Choose Native DnD (adapter) when:**

- You need drag-to-desktop or into other apps (files/URLs).
- You want to accept file drops from outside the app.

**Choose Custom Pointer Engine when:**

- You care about mobile/tablet and multi-touch.
- You need rich interactions (grids, snapping, nested lists).
- You need high-fps visuals and deterministic testing.
- You need first-class accessibility and keyboard sorting.

**In practice:** Use **both**—pointer core for UX, native adapter for OS interop.

---

## Migration Tips from SortableJS

- Ship a familiar “sortable list” preset (swap/reorder) with typed lifecycle events (`onChoose/onStart/onUpdate/onEnd`
  analogs).
- Keep plugin points for: auto-scroll, clone/ghost, handle, filter, copy vs move, axis lock, drag groups/between lists.
- Add `native: { enableExportHandle: true }` option to toggle export handles per item or list.

---

## Final Recommendation

Implement a **hybrid**:

1. **Pointer-driven core** (performance, mobile, a11y, features).
2. **Native DnD adapter** (desktop-only) for:
   - Inbound file drops.
   - Outbound cross-app drags (URLs/`DownloadURL` on web; real files via Electron’s `startDrag`).
3. **Clean, composable API** (sensors → engine → strategies → adapters) so consumers can adopt just what they need.
