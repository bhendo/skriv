import { useState, useEffect, useRef, useCallback } from "react";
import { displayChord } from "../utils/shortcuts";

interface SearchBarProps {
  matchCount: number;
  activeIndex: number;
  caseSensitive: boolean;
  initialShowReplace?: boolean;
  initialQuery?: string;
  focusKey?: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleCaseSensitive: () => void;
  onReplace: (replaceText: string) => void;
  onReplaceAll: (replaceText: string) => void;
  onClose: () => void;
}

export function SearchBar({
  matchCount,
  activeIndex,
  caseSensitive,
  initialShowReplace = false,
  initialQuery = "",
  focusKey,
  onQueryChange,
  onNext,
  onPrev,
  onToggleCaseSensitive,
  onReplace,
  onReplaceAll,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(initialShowReplace);

  useEffect(() => {
    // Each open (Cmd+F vs Cmd+Alt+F) re-asserts the requested mode
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing mode with the open request
    setShowReplace(initialShowReplace);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusKey, initialShowReplace]);

  // Both inputs share the keyboard contract: Escape closes the bar, Enter
  // runs the field's action (Shift+Enter the reverse one where it exists).
  const fieldKeyDown = useCallback(
    (onEnter: () => void, onShiftEnter?: () => void) => (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey && onShiftEnter) {
          onShiftEnter();
        } else {
          onEnter();
        }
      }
    },
    [onClose]
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
      <button
        className="search-btn search-replace-toggle"
        aria-label="Toggle replace"
        title="Toggle replace"
        onClick={() => setShowReplace((prev) => !prev)}
        tabIndex={-1}
      >
        {showReplace ? <>&#9662;</> : <>&#9656;</>}
      </button>
      <div className="search-rows">
        <div className="search-row">
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Find..."
            value={query}
            onChange={handleInput}
            onKeyDown={fieldKeyDown(onNext, onPrev)}
            autoFocus
          />
          <span className="search-count">{countDisplay}</span>
          <button
            className="search-btn"
            aria-label="Previous match"
            title={`Previous match (${displayChord("find-prev")})`}
            onClick={onPrev}
            tabIndex={-1}
          >
            &#9650;
          </button>
          <button
            className="search-btn"
            aria-label="Next match"
            title={`Next match (${displayChord("find-next")})`}
            onClick={onNext}
            tabIndex={-1}
          >
            &#9660;
          </button>
          <button
            className={`search-btn search-case-toggle ${caseSensitive ? "active" : ""}`}
            aria-label="Case sensitive"
            title="Match case"
            onClick={onToggleCaseSensitive}
            tabIndex={-1}
          >
            Aa
          </button>
          <button
            className="search-btn"
            aria-label="Close search"
            title="Close (Esc)"
            onClick={onClose}
            tabIndex={-1}
          >
            &#10005;
          </button>
        </div>
        {showReplace && (
          <div className="search-row">
            <input
              type="text"
              className="search-input"
              placeholder="Replace..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={fieldKeyDown(() => onReplace(replaceText))}
            />
            <button
              className="search-btn search-replace-btn"
              aria-label="Replace"
              title="Replace current match"
              onClick={() => onReplace(replaceText)}
              tabIndex={-1}
            >
              Replace
            </button>
            <button
              className="search-btn search-replace-btn"
              aria-label="Replace all"
              title="Replace all matches"
              onClick={() => onReplaceAll(replaceText)}
              tabIndex={-1}
            >
              All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
