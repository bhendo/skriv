/** Final path segment, handling both Unix and Windows separators. */
export function fileNameFromPath(path: string | null): string {
  if (!path) return "Untitled";
  const name = path.split(/[/\\]/).pop();
  return name || "Untitled";
}

/** Name of the directory containing `path`. */
export function parentFolderName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "Folder";
}
