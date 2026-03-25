import { describe, it, expect, vi, beforeEach } from "vitest";

// Declare mock via vi.hoisted so it is available when vi.mock factory runs
const { mockReadText } = vi.hoisted(() => ({ mockReadText: vi.fn() }));

// Mock the Tauri clipboard plugin module
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: mockReadText,
}));

import { readClipboardUrl } from "../../../plugins/link-source/clipboard";

describe("readClipboardUrl", () => {
  beforeEach(() => {
    mockReadText.mockReset();
  });

  it("returns a valid https URL from clipboard", async () => {
    mockReadText.mockResolvedValue("https://example.com");
    expect(await readClipboardUrl()).toBe("https://example.com");
  });

  it("returns a valid http URL from clipboard", async () => {
    mockReadText.mockResolvedValue("http://example.com/page?q=1");
    expect(await readClipboardUrl()).toBe("http://example.com/page?q=1");
  });

  it("returns null for plain text", async () => {
    mockReadText.mockResolvedValue("just some text");
    expect(await readClipboardUrl()).toBeNull();
  });

  it("returns null for empty clipboard", async () => {
    mockReadText.mockResolvedValue("");
    expect(await readClipboardUrl()).toBeNull();
  });

  it("returns null for javascript: URI", async () => {
    mockReadText.mockResolvedValue("javascript:alert(1)");
    expect(await readClipboardUrl()).toBeNull();
  });

  it("returns null for file: URI", async () => {
    mockReadText.mockResolvedValue("file:///etc/passwd");
    expect(await readClipboardUrl()).toBeNull();
  });

  it("returns null for mailto: URI", async () => {
    mockReadText.mockResolvedValue("mailto:user@example.com");
    expect(await readClipboardUrl()).toBeNull();
  });

  it("returns null when readText throws", async () => {
    mockReadText.mockRejectedValue(new Error("clipboard error"));
    expect(await readClipboardUrl()).toBeNull();
  });

  it("trims whitespace from clipboard text", async () => {
    mockReadText.mockResolvedValue("  https://example.com  \n");
    expect(await readClipboardUrl()).toBe("https://example.com");
  });

  it("returns null when readText resolves to null", async () => {
    mockReadText.mockResolvedValue(null);
    expect(await readClipboardUrl()).toBeNull();
  });
});
