export interface TocHeading {
  level: number; // 1-6
  text: string; // heading text content
  pos: number; // editor offset (PM doc position or CM line offset)
}
