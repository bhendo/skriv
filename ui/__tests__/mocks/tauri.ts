import { vi } from "vitest";

export const invoke = vi.fn();

type EventHandler = (event: { payload: unknown }) => void | Promise<void>;

export const listeners = new Map<string, EventHandler[]>();
export const unlisten = vi.fn();

export const listen = vi.fn((event: string, handler: EventHandler) => {
  const handlers = listeners.get(event) ?? [];
  handlers.push(handler);
  listeners.set(event, handlers);
  return Promise.resolve(unlisten);
});

/** Fire every handler registered for `event`, awaiting async handlers. */
export async function fireListeners(event: string, payload?: unknown): Promise<void> {
  for (const handler of listeners.get(event) ?? []) {
    await handler({ payload });
  }
}

export function resetTauriMocks(): void {
  invoke.mockReset();
  listen.mockClear();
  unlisten.mockReset();
  listeners.clear();
}
