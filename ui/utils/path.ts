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

/** Directory portion of `path` (everything before the last separator), "" when none. */
export function parentDirFromPath(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : "";
}

/** Replace a leading `home` prefix of `dir` with `~`. */
export function abbreviateHome(dir: string, home: string | null): string {
  if (!home) return dir;
  const root = home.replace(/[/\\]+$/, "");
  if (dir === root || dir.startsWith(root + "/") || dir.startsWith(root + "\\")) {
    return "~" + dir.slice(root.length);
  }
  return dir;
}

/**
 * Window title for the open document: `name — ~/parent/dir — Edited`.
 * The directory is omitted when no file is open ("Untitled").
 */
export function windowTitle(path: string | null, home: string | null, isModified: boolean): string {
  const name = fileNameFromPath(path);
  const dir = path ? abbreviateHome(parentDirFromPath(path), home) : "";
  const base = dir ? `${name} — ${dir}` : name;
  return isModified ? `${base} — Edited` : base;
}
