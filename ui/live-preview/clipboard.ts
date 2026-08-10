import { readText } from "@tauri-apps/plugin-clipboard-manager";

/**
 * Read the clipboard and return its content if it's a valid HTTP/HTTPS URL.
 * Returns null on any failure or non-URL content.
 */
export async function readClipboardUrl(): Promise<string | null> {
  try {
    const raw = await readText();
    const text = (raw ?? "").trim();
    if (!text) return null;
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return text;
    }
    return null;
  } catch {
    return null;
  }
}
