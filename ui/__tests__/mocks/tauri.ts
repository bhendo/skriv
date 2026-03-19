import { vi } from "vitest";

export const invoke = vi.fn();

export const listeners = new Map<string, Array<(event: { payload: unknown }) => void>>();
export const unlisten = vi.fn();

export const listen = vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
  const handlers = listeners.get(event) ?? [];
  handlers.push(handler);
  listeners.set(event, handlers);
  return Promise.resolve(unlisten);
});

export function resetTauriMocks(): void {
  invoke.mockReset();
  listen.mockClear();
  unlisten.mockReset();
  listeners.clear();
}
