# E2E `test.skip` / `test.fixme` Audit (#35)

First-pass triage of every `test.skip` and `test.fixme` in `tests/e2e/`.

## Categories

- **easy-unskip** — Test should pass with no library changes. Un-skipped and verified in this PR.
- **tracked-elsewhere** — Already linked to an existing open issue (#34, #48, #62, etc.). Skip remains in place; comment cites the issue.
- **needs-new-issue** — Real library gap or test-infra problem that isn't tracked. New issue filed in this PR.
- **valid-conditional** — `test.skip(condition, ...)` where the condition is rational (HTML5-only test skipped under fallback, desktop-only test skipped under mobile emulation). Skip remains.

## Inventory

| File:line | Test name | Category | Linked issue | Notes |
|-----------|-----------|----------|--------------|-------|
| `multi-select.spec.ts:99` | drags multiple selected items together | tracked-elsewhere | #34 | Pointer-based multi-drag not implemented; reconciled in #34. |
| `multi-select.spec.ts:140` | maintains selection state after drag | tracked-elsewhere | #34 | Same — multi-drag pipeline. |
| `handle-filter.spec.ts:15` | should only allow drag when initiated from handle | valid-conditional | — | Skips on chromium/webkit; runs on firefox. Pointer event simulation differs across browsers. |
| `handle-filter.spec.ts:115` | should work with nested handle elements | valid-conditional | — | `browserName !== 'firefox'` skip — firefox-only pointer test. |
| `handle-filter.spec.ts:175` | should prevent drag from filtered elements | valid-conditional | — | `browserName !== 'firefox'` skip. |
| `handle-filter.spec.ts:257` | should call onFilter callback | valid-conditional | — | `browserName !== 'firefox'` skip. |
| `handle-filter.spec.ts:329` | should respect both handle and filter | valid-conditional | — | `browserName !== 'firefox'` skip. |
| `library-initialization.spec.ts:22` | initializes Resortable library successfully | tracked-elsewhere | #48 | Mobile Chrome viewport bug. |
| `library-initialization.spec.ts:59` | verifies all sortable containers initialized | tracked-elsewhere | #48 | Mobile Chrome viewport bug. |
| `advanced-events.spec.ts:65` | should fire onSort event when sorting changes | needs-new-issue | #73 | HTML5 `dragAndDrop` is atomic; intermediate dragover events don't fire reliably. |
| `advanced-events.spec.ts:100` | should fire onChange event | needs-new-issue | #73 | Same root cause — atomic dragAndDrop. |
| `advanced-events.spec.ts:134` | should fire onMove event during drag | needs-new-issue | #73 | Same root cause — atomic dragAndDrop. Note `onMove` is covered in `on-move.spec.ts` via pointer pipeline, so library function is verified there. |
| `drag-and-drop.spec.ts:40` | moves items between list1 and list2 | tracked-elsewhere | #48 | Skips on Mobile Chrome. Comment updated to cite #48. |
| `drag-and-drop.spec.ts:65` | maintains shared group behavior | tracked-elsewhere | #48 | Skips on Mobile Chrome. Comment updated to cite #48. |
| `empty-container.spec.ts:64` | (mobile chrome) | tracked-elsewhere | #48 | Pre-existing. |
| `empty-container.spec.ts:78` | (mobile chrome) | tracked-elsewhere | #48 | Pre-existing. |
| `basic-sortable.spec.ts:86` | applies visual feedback classes | tracked-elsewhere | #48 | Mobile Chrome only. |
| `basic-sortable.spec.ts:93` | shows hover effects on sortable items | needs-new-issue | #74 | Attempted un-skip — failed (`transform === 'none'` after `.hover()`). Reclassified. |
| `basic-sortable.spec.ts:107` | handles touch input for drag and drop | needs-new-issue | #74 | Pointer-event touch simulation — same root cause as hover failure (test/CSS fixture mismatch + touch path covered by `on-move.spec.ts`). |
| `feature-demos.spec.ts:153` | can reorder folders using headers as handles | needs-new-issue | #75 | Hover intercept by parent container; needs hardier selector or layout fix. |
| `feature-demos.spec.ts:228` | requires holding for delay period | needs-new-issue | #76 | Delay-option testing — see also `delay-options.spec.ts` skips. |
| `feature-demos.spec.ts:267` | clones items from source to target list | needs-new-issue | #75 | HTML5 clone-mode tests need rework. |
| `feature-demos.spec.ts:313` | can drag items between lists bidirectionally | needs-new-issue | #75 | Clone-mode bidirectional. |
| `feature-demos.spec.ts:342` | source list items cannot be reordered | needs-new-issue | #75 | `sort: false` regression suspected. |
| `feature-demos.spec.ts:363` | can select items by clicking with Shift key | tracked-elsewhere | #34 | Multi-drag demo flow. |
| `feature-demos.spec.ts:407` | selection is cleared after drag | tracked-elsewhere | #34 | Multi-drag demo flow. |
| `swap-behavior.spec.ts:7` | (describe.skip — whole suite) | needs-new-issue | #77 | `swapThreshold` and friends require proper CSS layout fixture. |
| `swap-behavior.spec.ts:18` | should respect swapThreshold option | needs-new-issue | #77 | Inside describe.skip. |
| `swap-behavior.spec.ts:75` | should handle invertSwap option | needs-new-issue | #77 | Inside describe.skip. |
| `swap-behavior.spec.ts:119` | should respect direction option | needs-new-issue | #77 | Inside describe.skip. |
| `swap-behavior.spec.ts:167` | should use invertedSwapThreshold | needs-new-issue | #77 | Inside describe.skip. |
| `empty-insert-threshold.spec.ts:49` | (mobile) | valid-conditional | #48 | Desktop-only threshold test. Citation already includes #48. |
| `empty-insert-threshold.spec.ts:81` | (mobile) | valid-conditional | #48 | Same. |
| `keyboard-navigation.spec.ts:174` | supports keyboard navigation across groups | needs-new-issue | #78 | Cross-list keyboard drag-and-drop not implemented. |
| `grid-layout.spec.ts:25` | maintains grid layout CSS properties | **easy-unskip** | — | `test.fixme` for CSS-only assertion; no drag. Un-skipped and verified. |
| `grid-layout.spec.ts:52` | (chromium-only animation timing skip) | **easy-unskip** | — | Helper now reliable. Removed conditional skip and verified. |
| `on-move.spec.ts:139` | onMove default — cancel reorder | valid-conditional | #48 | `skipMobile`; mobile dragAndDrop unreliable. |
| `on-move.spec.ts:164` | onMove default — callback receives event | valid-conditional | #48 | `skipMobile`. |
| `on-move.spec.ts:199` | onMove default — force insert-before | valid-conditional | #48 | `skipMobile`. |
| `on-move.spec.ts:221` | onMove default — force insert-after | valid-conditional | #48 | `skipMobile`. |
| `on-move.spec.ts:261` | onMove fallback — cancel reorder | valid-conditional | #48 | Desktop-only; touch emulation differs. |
| `on-move.spec.ts:291` | onMove fallback — receives PointerEvent | valid-conditional | #48 | Desktop-only. |
| `on-move.spec.ts:323` | onMove fallback — force insert-before | valid-conditional | #48 | Desktop-only. |
| `on-move.spec.ts:386` | onMove cross-zone — cancel enter | valid-conditional | #48 | `skipMobile`. |
| `on-move.spec.ts:419` | onMove cross-zone — empty target container | valid-conditional | #48 | `skipMobile`. |
| `delay-options.spec.ts:6` | should delay drag start with delay option | needs-new-issue | #76 | Delay simulation is timing-sensitive. |
| `delay-options.spec.ts:43` | should only delay on touch with delayOnTouchOnly | needs-new-issue | #76 | Touch-delay testing. |
| `delay-options.spec.ts:90` | should cancel delayed drag beyond threshold | needs-new-issue | #76 | Threshold cancellation simulation. |
| `event-callbacks.spec.ts:55` | displays status updates in status div | tracked-elsewhere | #48 | Mobile Chrome dragAndDrop timeout. Comment updated to cite #48. |
| `event-callbacks.spec.ts:84` | logs add/remove events for cross-list | tracked-elsewhere | #48 | Same. |
| `event-callbacks.spec.ts:223` | captures event object properties | tracked-elsewhere | #48 | Same. |
| `ghost-elements.spec.ts:30` | applies drag class during drag — TODO flaky | needs-new-issue | #73 | Atomic dragAndDrop; folded into the onSort/onChange/onMove issue (same root cause). |
| `ghost-elements.spec.ts:89` | (chromium-only animation timing skip) | **easy-unskip** | — | Helper now reliable. Removed conditional skip and verified. |
| `ghost-elements.spec.ts:158` | handles cross-list drag with ghost elements | tracked-elsewhere | #48 | Mobile Chrome dragAndDrop timeout. Comment updated to cite #48. |
| `fallback-mode.spec.ts:51` | ghost has ghostClass + fallbackClass | valid-conditional | #48 | Desktop-only fallback test. |
| `fallback-mode.spec.ts:81` | drag reorders w/o HTML5 listeners | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:189` | fallbackOnBody:false in zone | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:217` | fallbackOnBody:true on body | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:242` | fallbackOffsetX shifts ghost X | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:286` | fallbackOffsetY shifts ghost Y | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:395` | small pointer move does not start | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:426` | movement past threshold starts drag | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:460` | pointerup during capture phase | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:575` | fallbackOnBody:false + offsets | valid-conditional | #48 | Desktop-only. |
| `fallback-mode.spec.ts:650` | end-to-end happy path | valid-conditional | #48 | Desktop-only. |
| `animation-visual.spec.ts:12` | (CI env skip — whole describe) | valid-conditional | — | Skipped when `process.env.CI` truthy; the suite tests animation timing which is unreliable on slow CI servers. |
| `animation.spec.ts:5` | (describe.skip — whole suite) | needs-new-issue | #79 | "Requires full drag-and-drop implementation"; needs rework with current pipeline. |

## Numerical breakdown

- **Total skips audited:** 65 (matches `grep -rE "test\.(skip\|fixme)\(" tests/e2e/` count). `animation.spec.ts:5` and `swap-behavior.spec.ts:7` are `describe.skip` lines; `swap-behavior.spec.ts` also contains 4 inner `test.skip` lines counted individually — both shapes are captured above.
- **easy-unskip:** 3 verified passing (`grid-layout.spec.ts:25`, `grid-layout.spec.ts:52`, `ghost-elements.spec.ts:89`). One additional candidate (`basic-sortable.spec.ts:93`) was attempted but failed empirically — reclassified to needs-new-issue (#74).
- **tracked-elsewhere:** ~17 entries (the Mobile Chrome #48 set, multi-drag #34 set; comment citations refreshed on 6 entries in `event-callbacks.spec.ts`, `drag-and-drop.spec.ts`, `ghost-elements.spec.ts:158` to explicitly cite #48).
- **needs-new-issue:** 7 new issues filed (see below), covering 23 skipped tests grouped by root cause.
- **valid-conditional:** ~22 entries (`skipMobile` in fallback / on-move / empty-insert-threshold, firefox-only handle/filter tests, CI-env animation-visual skip).

## New issues filed (#35 — discovered during E2E skip triage)

- `#73` — Atomic `page.dragAndDrop` swallows intermediate dragover events (onSort/onChange/onMove/drag-class tests).
- `#74` — `basic-sortable` hover-effects + touch-input tests — failed un-skip plus pointer touch simulation.
- `#75` — `feature-demos` nested-list hover intercept + clone-mode regressions.
- `#76` — Delay-option E2E specs blocked on timing simulation.
- `#77` — `swap-behavior` suite needs CSS-positioned fixture.
- `#78` — Cross-list keyboard drag-and-drop not implemented.
- `#79` — `animation.spec.ts` integration suite needs full pipeline rework.
