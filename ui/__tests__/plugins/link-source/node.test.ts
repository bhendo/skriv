import { describe, it, expect } from "vitest";
import { linkSourceSerializerRunner } from "../../../plugins/link-source/node";

function mockState() {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    openNode(type: string, attrs?: Record<string, unknown>) {
      calls.push({ method: "openNode", args: [type, attrs] });
    },
    closeNode() {
      calls.push({ method: "closeNode", args: [] });
    },
    addNode(type: string, attrs?: Record<string, unknown>, value?: string) {
      calls.push({ method: "addNode", args: [type, attrs, value] });
    },
  };
}

describe("linkSourceSerializerRunner", () => {
  it("serializes valid link syntax from raw text", () => {
    const state = mockState();
    linkSourceSerializerRunner(
      state as never,
      {
        textContent: "[hello](https://example.com)",
        attrs: { href: "https://example.com", title: "" },
      } as never
    );
    expect(state.calls).toEqual([
      {
        method: "openNode",
        args: ["link", { url: "https://example.com", title: undefined }],
      },
      { method: "addNode", args: ["text", undefined, "hello"] },
      { method: "closeNode", args: [] },
    ]);
  });

  it("serializes link with title", () => {
    const state = mockState();
    linkSourceSerializerRunner(
      state as never,
      {
        textContent: '[text](url "My Title")',
        attrs: { href: "url", title: "My Title" },
      } as never
    );
    expect(state.calls).toEqual([
      {
        method: "openNode",
        args: ["link", { url: "https://url", title: "My Title" }],
      },
      { method: "addNode", args: ["text", undefined, "text"] },
      { method: "closeNode", args: [] },
    ]);
  });

  it("serializes link with inner bold marks", () => {
    const state = mockState();
    linkSourceSerializerRunner(
      state as never,
      {
        textContent: "[**bold**](url)",
        attrs: { href: "url", title: "" },
      } as never
    );
    expect(state.calls).toEqual([
      { method: "openNode", args: ["link", { url: "https://url", title: undefined }] },
      { method: "openNode", args: ["strong", undefined] },
      { method: "addNode", args: ["text", undefined, "bold"] },
      { method: "closeNode", args: [] },
      { method: "closeNode", args: [] },
    ]);
  });

  it("falls back to attrs when raw text is invalid", () => {
    const state = mockState();
    linkSourceSerializerRunner(
      state as never,
      {
        textContent: "[incomplete",
        attrs: { href: "https://example.com", title: "" },
      } as never
    );
    expect(state.calls).toEqual([
      {
        method: "openNode",
        args: ["link", { url: "https://example.com", title: undefined }],
      },
      { method: "addNode", args: ["text", undefined, "[incomplete"] },
      { method: "closeNode", args: [] },
    ]);
  });

  it("serializes as plain text when no valid link data", () => {
    const state = mockState();
    linkSourceSerializerRunner(
      state as never,
      {
        textContent: "just text",
        attrs: { href: "", title: "" },
      } as never
    );
    expect(state.calls).toEqual([{ method: "addNode", args: ["text", undefined, "just text"] }]);
  });
});
