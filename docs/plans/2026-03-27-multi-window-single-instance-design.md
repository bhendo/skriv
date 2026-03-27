# Multi-Window and Single-Instance Support

**Issue:** #5
**Date:** 2026-03-27
**Status:** Design

## Summary

Support opening multiple files in separate windows while maintaining a single application instance. Each window is independent with its own file state, watcher, and editor. The app behaves like a native macOS editor — Cmd+N for blank windows, Cmd+O for opening files, single-instance detection to prevent duplicate processes, and unsaved-changes dialogs on close.

## Backend State Model

Replace the global `OpenedFile` and `FileWatcher` singletons with a central `WindowManager`:

```rust
struct WindowState {
    file_path: Option<PathBuf>,              // None for blank windows; always canonical
    watcher: Option<RecommendedWatcher>,
    watched_path: Option<PathBuf>,
    last_self_write: Arc<Mutex<Option<Instant>>>,
    debounce_tx: Option<std::sync::mpsc::Sender<()>>,
}

struct WindowManager {
    windows: Mutex<HashMap<String, WindowState>>,
    next_id: AtomicU64,                      // monotonic counter for unique window labels
}
```

- Registered as `tauri::State<WindowManager>`, replacing both `OpenedFile` and `FileWatcher`
- Entry created when a window is opened, removed on close
- Existing `FileWatcher` logic (debounce, self-write suppression) moves into `WindowState` methods
- All commands gain the window label via `tauri::Window` parameter — Tauri provides this automatically
- The initial window created by `tauri.conf.json` is labeled `"main"`; dynamically created windows use `"window-{next_id}"`. The `WindowManager` handles both label styles uniformly
- File paths stored in `WindowState` are always canonicalized (via `ValidatedPath`) so the already-open check works correctly across symlinks and relative paths

## Window Lifecycle

### Creating Windows

A `create_window()` Rust helper calls `WebviewWindowBuilder::new()` with a unique label from `WindowManager.next_id`, sets default size (900x700) and title ("Untitled"), and inserts a new `WindowState` entry into the `WindowManager` map. The webview URL is resolved from the Tauri app config (respecting dev server vs. production dist). If a file path is provided, the file is opened immediately after creation.

Three creation paths:

1. **Cmd+N** — Frontend invokes `create_window` command with no file path. Creates a blank window.
2. **Cmd+O from existing window** — Frontend invokes `create_window` with the selected file path. Opens in the current window if it's blank and unmodified (i.e., `path === null && isModified === false`).
3. **External open** (Finder, CLI, single-instance plugin) — Rust-side creates a new window with the file path.

### Closing Windows

- Listen for Tauri's `close_requested` via `getCurrentWindow().onCloseRequested()` in the frontend
- If `isModified`, call `event.preventDefault()` and show the macOS-standard save/don't-save/cancel sheet via `tauri-plugin-dialog`
- On confirmed close, frontend invokes `close_window` command which cleans up the `WindowState` entry (stops watcher, removes from map) and destroys the window from the Rust side
- When the last window closes, the app quits (standard macOS quit behavior; staying alive with zero windows is a future consideration)

### App Quit (Cmd+Q)

Intercept `RunEvent::ExitRequested` in the Rust `.run()` callback. When received:

1. Call `event.prevent_exit()`
2. Iterate all windows in `WindowManager` and emit a `quit-requested` event to each
3. Each frontend window handles this the same as `close_requested` — show save/don't-save/cancel if modified
4. Each window reports back (via a `window-close-confirmed` command) when resolved
5. Once all windows have confirmed, call `app_handle.exit(0)`

If any window cancels, the quit is aborted.

### Already-Open Check

When opening a file, `WindowManager` scans existing entries for a matching `file_path` (compared on canonicalized paths). If found, that window is focused instead of creating a duplicate.

## Single-Instance Support

Uses `tauri-plugin-single-instance` (v2.x, new dependency — cross-platform, uses platform-specific IPC).

When a second Skriv process launches (e.g., double-clicking another `.md` file), the plugin detects the existing instance and forwards the CLI args. The existing instance receives a callback, extracts file paths, and either focuses the window that already has that file open or creates a new window.

The existing `RunEvent::Opened { urls }` handler (macOS file associations) calls the same create-or-focus logic instead of emitting to a fixed "main" window.

CLI args on first launch use the same shared path — parse args, create window(s) for each file (note: current code only handles one file; this extends to multiple). If no files are provided, create one blank window.

All three entry points (first launch, single-instance callback, macOS `Opened` event) converge on one function: given a list of file paths, open or focus windows for them.

## Command Changes

### Modified Commands

| Command | Change |
|---------|--------|
| `read_file` | No state change — already stateless |
| `write_file` | Looks up `WindowState` by window label to record self-write on the correct watcher |
| `write_new_file` | After writing, updates `WindowState.file_path` for the calling window, starts a watcher, and expands asset scope. (This fixes an existing gap where Save As didn't set up watching.) |
| `get_file_info` | No change — stateless query |
| `watch_file` | Creates watcher in the calling window's `WindowState` |
| `unwatch_file` | Cleans up watcher in the calling window's `WindowState` |
| `get_opened_file` | Looks up the calling window's `file_path` from `WindowManager` |

### New Commands

| Command | Purpose |
|---------|---------|
| `create_window` | Creates a new window, optionally with a file path. Returns the new window label. |
| `close_window` | Cleans up `WindowState` for the calling window (stops watcher, removes entry). Destroys the window. |

The frontend code for each window doesn't change significantly. Each window still calls the same commands — the backend routes to the correct `WindowState` using the window label Tauri provides automatically.

**Event targeting:** The file watcher currently uses `app_handle.emit()` which broadcasts to all windows. This must change to `app_handle.emit_to(label, ...)` so `file-changed` events only reach the window watching that specific file.

## Frontend Changes

Each Tauri window gets its own webview with its own React app instance, so all hooks (`useFile`, `useSearch`, `useTheme`, etc.) are naturally per-window already.

### What Changes

1. **Cmd+N handler** — Added to `useKeyboardShortcuts`. Invokes `create_window` command.
2. **Cmd+O behavior** — If the current window is blank and unmodified, open in place. Otherwise, invoke `create_window` with the selected path.
3. **Close handling** — `close_requested` listener in `App.tsx`. If not modified: invoke `close_window`. If modified: show save/don't-save/cancel dialog. Save → save then close. Don't Save → close. Cancel → prevent close.
4. **`file-opened` event listener removed** — Rust backend handles external file opens directly by creating windows.

### What Stays the Same

- `useFile`, `useSearch`, `useTheme`, editor components — all unchanged
- Window title updates — already per-window via `getCurrentWindow().setTitle()`
- All keyboard shortcuts except Cmd+N and Cmd+O

## Asset Scope and Security

The asset protocol scope is global and additive — files opened in different windows accumulate scope entries. This is acceptable behavior; a file opened in one window making images from that directory visible to another window matches how browsers handle same-origin resources. No changes needed to `ValidatedPath` or `scope.rs`.

The `default.json` capability currently targets the `"main"` window and must be updated to `"windows": ["*"]` so dynamically created windows receive the same permissions.

## Testing Strategy

### Rust Unit Tests

- `WindowManager` — insert/remove/lookup window state, already-open detection
- `WindowState` — watcher lifecycle, self-write suppression (existing watcher tests adapted)
- Command tests — verify commands route to correct `WindowState` by window label

### Integration Tests (Tauri)

- Single-instance callback correctly creates windows
- CLI args parsed into window creation calls
- Window close cleans up state

### Frontend Tests (Vitest)

- Close-requested handler logic (modified vs. unmodified paths)
- Cmd+N / Cmd+O routing logic (blank window vs. new window)

### E2E Tests (Playwright)

- Open file → opens in window
- Cmd+N → blank window appears
- Open same file twice → focuses existing window instead of duplicate
- Close with unsaved changes → dialog appears

## Future Considerations

The `WindowManager` with its `HashMap<String, WindowState>` is designed to evolve toward tabs. When tabs are added, the key shifts from window label to a nested structure (window → tabs → file state). The state map pattern scales to this naturally without architectural replacement.

**Not in scope:** Native menu bar (File > New, Window menu listing open files). Rely on keyboard shortcuts and macOS window switching (Cmd+`, Mission Control) for now.
