import { useState, useEffect, useRef, useCallback } from "react";

interface SearchBarProps {
  matchCount: number;
  activeIndex: number;
  caseSensitive: boolean;
  initialQuery?: string;
  focusKey?: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleCaseSensitive: () => void;
  onClose: () => void;
}

export function SearchBar({
  matchCount,
  activeIndex,
  caseSensitive,
  initialQuery = "",
  focusKey,
  onQueryChange,
  onNext,
  onPrev,
  onToggleCaseSensitive,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusKey]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onNext();
      }
    },
    [onClose, onNext, onPrev]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      onQueryChange(e.target.value);
    },
    [onQueryChange]
  );

  const countDisplay =
    matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : query ? "No results" : "";

  return (
    <div className="search-bar" role="search">
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Find..."
        value={query}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <span className="search-count">{countDisplay}</span>
      <button className="search-btn" aria-label="Previous match" onClick={onPrev} tabIndex={-1}>
        &#9650;
      </button>
      <button className="search-btn" aria-label="Next match" onClick={onNext} tabIndex={-1}>
        &#9660;
      </button>
      <button
        className={`search-btn search-case-toggle ${caseSensitive ? "active" : ""}`}
        aria-label="Case sensitive"
        onClick={onToggleCaseSensitive}
        tabIndex={-1}
      >
        Aa
      </button>
      <button className="search-btn" aria-label="Close search" onClick={onClose} tabIndex={-1}>
        &#10005;
      </button>
    </div>
  );
}
