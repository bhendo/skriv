export interface TocHeading {
  level: number; // 1-6
  text: string; // heading text with inline markers preserved
  pos: number; // char offset of the heading start in the CodeMirror doc
}

export type SidebarTab = "files" | "outline";
