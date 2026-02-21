# Mobile Touch Support Design

**Date:** 2026-02-21
**Status:** Approved

## Problem

Resortable does not work on mobile devices. When accessed on an iPhone (or any touch device), users cannot drag items. The library already uses Pointer Events (`pointerdown`, `pointermove`, `pointerup`) which unify mouse/touch/pen, but several gaps prevent touch from actually working.

## Root Causes

1. **Missing `touch-action` CSS** — Without `touch-action: none` on draggable items, browsers intercept touch for scrolling/zooming before pointer events fire.
2. **HTML5 DnD interference** — Items have `draggable="true"`, which triggers the browser's native drag path. HTML5 Drag and Drop has zero mobile browser support and interferes with pointer events on touch.
3. **AutoScrollPlugin uses `mousemove`** — Mouse events don't fire on touch devices, so auto-scroll during drag is broken.
4. **No hold-to-drag feedback** — No visual cue during the delay period telling users a drag is about to start.
5. **No default touch delay** — `delayOnTouchOnly` is undefined, so there's no scroll-vs-drag disambiguation.

## Approach: Core DragManager Enhancement

Fix the specific gaps in the existing architecture. No new abstractions, no sensor layer — Pointer Events already serve as the input unification layer.

### 1. Touch-Action CSS Management

- On `DragManager.attach()`, apply `touch-action: none` to draggable items
- If a handle is configured, apply `touch-action: none` only to handles (so item body can scroll)
- On `detach()`, restore original `touch-action` values
- The existing `touchStartThreshold` already cancels hold if finger moves too far, allowing natural scroll

### 2. HTML5 DnD Suppression on Touch

- Detect touch capability via `navigator.maxTouchPoints > 0`
- On touch-capable devices, do not set `draggable="true"` on items
- Ensure `dragstart` is prevented when `pointerType === 'touch'` (partially exists at DragManager line 249-252, needs hardening)
- Keep `draggable="true"` on mouse-only devices

### 3. Hold-to-Drag Visual Feedback

- When delay timer starts on touch, add CSS class `sortable-holding` to the item
- Apply default inline styles: `transform: scale(1.03)`, elevated `box-shadow`, 150ms transition
- On delay completion → remove class, start drag
- On delay cancellation (moved too far, second finger, pointerup) → remove class, restore styles
- Hooks into existing `startDragDelay()` method

### 4. AutoScrollPlugin Fix

- Change `mousemove` listener to `pointermove` in AutoScrollPlugin
- One-line fix that makes auto-scroll work for all pointer types

### 5. Default Touch Options

- `delayOnTouchOnly`: default to `200` ms
- `touchStartThreshold`: keep current default (accommodates finger wobble)

## Testing Strategy

- **Unit tests**: Mock `PointerEvent` with `pointerType: 'touch'` to test delay, hold feedback, cancellation
- **Playwright tests**: Use Playwright's `touchscreen` API for tap-hold-drag, scroll-vs-drag, multi-touch cancellation
- **Manual testing**: iPhone via Vite dev server

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drag trigger | Delay-based (200ms hold) | Matches iOS/Android native reorder UX |
| Hold feedback | Scale + shadow | Universally understood, matches Material/iOS |
| HTML5 DnD on touch | Disable | Zero mobile support, only causes interference |
| Architecture | Enhance DragManager | Pointer Events already unifies inputs; sensor layer is over-engineering |
