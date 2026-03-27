import type { TocHeading } from "../types/toc";

interface TocSidebarProps {
  headings: TocHeading[];
  activeIndex: number;
  isOpen: boolean;
  onToggle: () => void;
  onHeadingClick: (pos: number) => void;
}

const INDENT_PER_LEVEL = 12;

export function TocSidebar({
  headings,
  activeIndex,
  isOpen,
  onToggle,
  onHeadingClick,
}: TocSidebarProps) {
  return (
    <div className={`toc-sidebar ${isOpen ? "" : "toc-sidebar--collapsed"}`}>
      <div className="toc-sidebar__inner">
        <div className="toc-sidebar__header">
          <span className="toc-sidebar__title">Contents</span>
          <button
            className="toc-sidebar__toggle"
            onClick={onToggle}
            aria-label="Collapse table of contents"
          >
            ‹
          </button>
        </div>
        <nav className="toc-sidebar__nav">
          {headings.length === 0 ? (
            <p className="toc-sidebar__empty">No headings</p>
          ) : (
            headings.map((heading, i) => (
              <button
                key={`${heading.pos}-${heading.text}`}
                className={`toc-sidebar__item toc-sidebar__item--h${heading.level}`}
                style={{ paddingLeft: `${8 + (heading.level - 1) * INDENT_PER_LEVEL}px` }}
                aria-current={i === activeIndex ? "true" : undefined}
                onClick={() => onHeadingClick(heading.pos)}
                title={heading.text}
              >
                {heading.text}
              </button>
            ))
          )}
        </nav>
      </div>
    </div>
  );
}
