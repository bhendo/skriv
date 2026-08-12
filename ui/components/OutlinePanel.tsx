import type { TocHeading } from "../types/toc";

interface OutlinePanelProps {
  headings: TocHeading[];
  activeIndex: number;
  onHeadingSelect: (heading: TocHeading) => void;
}

const INDENT_PER_LEVEL = 12;

export function OutlinePanel({ headings, activeIndex, onHeadingSelect }: OutlinePanelProps) {
  if (headings.length === 0) {
    return <div className="sidebar-empty">No headings</div>;
  }

  return (
    <nav className="sidebar-section" aria-label="Document outline">
      {headings.map((heading, i) => (
        <button
          // Index key on purpose: the list is fully replaced per extraction and
          // the buttons are stateless, so shifting positions patch in place
          // instead of remounting every item below an edit.
          key={i}
          className={
            i === activeIndex ? "sidebar-item outline-item active" : "sidebar-item outline-item"
          }
          style={{ paddingLeft: `${8 + (heading.level - 1) * INDENT_PER_LEVEL}px` }}
          aria-current={i === activeIndex ? "true" : undefined}
          title={heading.text}
          onClick={() => onHeadingSelect(heading)}
        >
          {heading.text}
        </button>
      ))}
    </nav>
  );
}
