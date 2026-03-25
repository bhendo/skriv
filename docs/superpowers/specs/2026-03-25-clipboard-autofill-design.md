# Cmd+K Clipboard Auto-Fill via Tauri Clipboard Plugin

**Issue:** #56
**Date:** 2026-03-25

## Problem

When creating a link with Cmd+K, the URL field is always empty. Typora auto-fills the URL from the clipboard if it contains a valid HTTP/HTTPS URL. The original design doc specified `navigator.clipboard.readText()`, but this triggers a browser permission prompt in the Tauri webview, so it was never implemented.

## Solution

Add `@tauri-apps/plugin-clipboard-manager` to read the clipboard through Tauri's native IPC, bypassing the browser permission prompt.

## Changes

### Backend (Tauri)

- Add `tauri-plugin-clipboard-manager` crate to `src-tauri/Cargo.toml`
- Register plugin in `src-tauri/src/lib.rs` via `.plugin(tauri_plugin_clipboard_manager::init())`
- Add `clipboard-manager:default` permission to `src-tauri/capabilities/default.json`

### Frontend (JS)

- Add `@tauri-apps/plugin-clipboard-manager` to `package.json`
- Add `readClipboardUrl()` helper to `ui/plugins/link-source/plugin.ts`:
  1. Call `readText()` from `@tauri-apps/plugin-clipboard-manager`
  2. Validate with `try { new URL(text) }` — accept only `http:` and `https:` protocols
  3. Return the URL string or `null` on any failure
- Modify Cmd+K handler Cases 2 (text selected) and 3 (no selection) to use the clipboard URL

### Async Strategy

`handleKeyDown` is synchronous and must return `boolean`. The handler uses a two-phase dispatch:

**Phase 1 (synchronous):** Create the `link_source` node with empty parens exactly as today. Return `true` to claim the keypress.

**Phase 2 (async callback):** Read the clipboard, validate the URL, and if valid, dispatch a second transaction to fill in the URL.

```
Cmd+K pressed
  -> Phase 1: dispatch [text]() or [](), position cursor (same as today)
  -> return true (claim keypress)
  -> Phase 2 (async): readClipboardUrl()
    -> valid URL: dispatch second transaction to fill parens with URL
    -> no URL / failure: do nothing (Phase 1 result stands)
```

**Async safety:** The Phase 2 callback must:
- Re-derive `view.state` at dispatch time (not close over the stale state from Phase 1)
- Verify the `link_source` node still exists at the expected position
- Check that the URL portion is still empty (guard against the user having already started typing)

If any of these checks fail, Phase 2 silently does nothing.

### URL Validation

A clipboard string is treated as a URL only if:
- It parses successfully via `new URL(text)`
- The parsed URL protocol is `http:` or `https:`

Everything else (plain text, file paths, `javascript:` URIs, etc.) is ignored.

Note: We use `try { new URL(text) }` instead of `URL.canParse()` for broader webview compatibility (`URL.canParse()` requires Safari 17+ / macOS Sonoma 14+).

### Error Handling

Any failure — clipboard empty, not a URL, plugin error, exception — silently falls back to the current behavior (empty parens from Phase 1). No user-facing error messages.

### Cursor Positioning

**Case 2 (text selected):**
- **With clipboard URL:** `[text](https://example.com)|` — cursor after closing paren (link is complete, user continues typing prose). Matches Typora behavior.
- **Without clipboard URL:** `[text](|)` — cursor inside empty parens, same as current behavior.

**Case 3 (no selection):**
- **With clipboard URL:** `[|](https://example.com)` — cursor inside brackets so the user can type link text. Matches Typora behavior.
- **Without clipboard URL:** `[|]()` — cursor inside brackets, same as current behavior.

## Test Scenarios

| Scenario | Expected result |
|----------|-----------------|
| Clipboard has valid `https://` URL, text selected | `[text](clipboard-url)`, cursor after `)` |
| Clipboard has valid `http://` URL, no selection | `[](clipboard-url)`, cursor inside `[]` |
| Clipboard has plain text (not a URL) | Falls back to empty parens |
| Clipboard is empty | Falls back to empty parens |
| Clipboard has `javascript:alert(1)` | Rejected — not http/https |
| Clipboard has `file:///path` | Rejected — not http/https |
| Clipboard read fails (plugin error) | Falls back to empty parens |
| User types in URL field before async completes | Phase 2 does nothing (URL field no longer empty) |

## Files Modified

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-clipboard-manager` dependency |
| `src-tauri/src/lib.rs` | Register clipboard manager plugin |
| `src-tauri/capabilities/default.json` | Add `clipboard-manager:default` permission |
| `package.json` | Add `@tauri-apps/plugin-clipboard-manager` |
| `ui/plugins/link-source/plugin.ts` | Add `readClipboardUrl()`, update Cmd+K handler |
