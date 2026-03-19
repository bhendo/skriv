# Frontend Unit Tests Design

## Summary

Add Vitest-based unit tests for frontend hooks and components. Addresses [GitHub issue #4](https://github.com/bhendo/skriv/issues/4).

## Dependencies

- `vitest` — test runner (integrates with Vite)
- `@testing-library/react` — React component/hook rendering
- `@testing-library/user-event` — simulating user interactions
- `jsdom` — DOM environment for tests

## Configuration

**`vitest.config.ts`** at project root. Extends `vite.config.ts` but overrides `root` back to `.` (Vite config sets `root: "ui"` for dev/build, but tests need project root for module resolution). Sets `jsdom` as the test environment.

**npm scripts:**
- `"test": "vitest run"` — single run (CI)
- `"test:watch": "vitest"` — watch mode (dev)

## File Layout

```
ui/__tests__/
  mocks/
    tauri.ts              # shared Tauri API mocks
  hooks/
    useFile.test.ts
    useKeyboardShortcuts.test.ts
    useTheme.test.ts
  components/
    ErrorBanner.test.tsx
```

## Tauri Mock Strategy

A shared mock module at `ui/__tests__/mocks/tauri.ts` provides:

- **`@tauri-apps/api/core`** — mock `invoke` function. Tests configure per-command return values via `mockResolvedValue` / `mockRejectedValue`. Each test file calls `vi.mock("@tauri-apps/api/core", ...)` importing from the shared module.
- **`@tauri-apps/api/event`** — mock `listen` function that captures registered listeners and returns an unlisten spy. Tests can simulate Tauri events by calling captured listeners directly.

Each test file explicitly imports and wires up the mocks — no global auto-mocking.

## Test Coverage

### `useFile` (~8 tests)

| Test | Behavior |
|------|----------|
| Initial state | path null, content empty, isModified false, fileName "Untitled", error null |
| `openFile` success | Calls `invoke("read_file")` then `invoke("watch_file")`, sets content/path/fileName |
| `openFile` error | Sets error state, preserves previous state |
| `saveFile` success | Calls `invoke("write_file")`, clears isModified |
| `saveFile` no path | Returns false without invoking |
| `saveFile` error | Sets error state, returns false |
| `saveNewFile` success | Calls `invoke("write_new_file")`, updates path/fileName |
| `markModified` | Sets isModified true; idempotent on repeated calls |
| `clearError` | Clears error state |

### `useKeyboardShortcuts` (~3 tests)

| Test | Behavior |
|------|----------|
| Cmd/Ctrl+S | Fires `onSave`, prevents default |
| Cmd/Ctrl+Shift+S | Fires `onSaveAs`, prevents default |
| Cmd/Ctrl+O | Fires `onOpen`, prevents default |

### `useTheme` (~4 tests)

| Test | Behavior |
|------|----------|
| Light system preference | Initial theme is `"classic"` |
| Dark system preference | Initial theme is `"classic-dark"` |
| System preference change | Theme updates when media query fires change event |
| Style injection | Creates style element with id `"crepe-theme"` |

### `ErrorBanner` (~3 tests)

| Test | Behavior |
|------|----------|
| Null message | Renders nothing |
| With message | Renders message text |
| Dismiss | Calls `onDismiss` when button clicked |

**Total: ~18 tests**

## Out of Scope (future work)

- **`App.tsx`** — integration-level orchestration tests (requires mocking Crepe, dialogs, events, and invoke together)
- **`Editor.tsx`** — Milkdown Crepe wrapper (mocking Crepe internals is brittle)
- **E2E tests** — Tauri WebDriver-based tests
