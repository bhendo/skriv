# File Watcher Debounce & Auto-Reload

**Issue:** [#16 — File watcher triggers multiple reload popups for a single external edit](https://github.com/bhendo/skriv/issues/16)
**Date:** 2026-03-19

## Problem

When an external process modifies the currently open file, the OS emits multiple filesystem events for a single logical write. Each event triggers a blocking `confirm()` dialog, creating a rapid-fire popup loop that forces the user to click through many dialogs.

## Design

### Backend: Debounced file watcher (`watcher.rs`)

When a `Modify` event arrives, start/reset a 300ms timer. Only emit `"file-changed"` after 300ms of quiet. This collapses any burst of OS events into a single Tauri event emission.

A dedicated thread owns the timer. The `notify` callback signals that thread (via `mpsc` or atomic flag), which resets its countdown on each signal. When the countdown expires, it checks self-write suppression and emits the Tauri event.

The existing self-write suppression (`last_self_write` / `SELF_WRITE_SUPPRESSION_MS`) stays as-is, checked before emitting in the debounce thread.

### Frontend: Auto-reload when clean, banner when dirty (`App.tsx`)

When `"file-changed"` arrives:

- If `isModified` is **false** — silently call `openFile(path)` to reload. No prompt.
- If `isModified` is **true** — show a non-blocking `ReloadBanner` (modeled after `ErrorBanner`) with "File changed on disk" and Reload / Dismiss buttons.

The blocking `confirm()` call is removed entirely.

### Testing

- **Rust unit test:** Verify debounce logic — multiple rapid signals result in a single emission after the quiet period.
- **Frontend unit test:** Verify auto-reload when `isModified` is false, and banner display when `isModified` is true.

## Decisions

| Decision | Rationale |
|---|---|
| Backend debounce, not frontend | Rust owns file management; solves the problem at the source and reduces IPC noise |
| 300ms debounce window | Long enough to coalesce typical write bursts, short enough to feel responsive |
| Auto-reload when unmodified | Matches Typora behavior — no unnecessary prompts |
| Non-blocking banner when modified | Prevents the `confirm()` queue-and-block loop |
