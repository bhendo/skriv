import { useEffect, useMemo, useRef } from "react";
import { FORMATTING_SHORTCUTS } from "../live-preview";
import {
  SHORTCUTS,
  displayChord,
  displayEditorChord,
  type ShortcutGroup,
} from "../utils/shortcuts";

interface ShortcutCheatsheetProps {
  onClose: () => void;
}

const GROUP_ORDER: readonly (ShortcutGroup | "Formatting")[] = [
  "File",
  "Search",
  "Formatting",
  "View",
  "Help",
];

interface Row {
  label: string;
  chords: readonly string[];
}

function rowsForGroup(group: ShortcutGroup | "Formatting"): Row[] {
  if (group === "Formatting") {
    return FORMATTING_SHORTCUTS.map((f) => ({
      label: f.label,
      chords: f.keys.map(displayEditorChord),
    }));
  }
  return SHORTCUTS.filter((s) => s.group === group).map((s) => ({
    // Menu labels carry the dialog ellipsis ("Open…"); a reference list doesn't.
    label: s.label.replace(/…$/, ""),
    chords: [displayChord(s.id)],
  }));
}

export function ShortcutCheatsheet({ onClose }: ShortcutCheatsheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the dialog so Escape works immediately; the keydown handler sits on
  // the backdrop, which every focusable inside the panel bubbles up to.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Static per mount: the registry and platform never change at runtime.
  const sections = useMemo(
    () => GROUP_ORDER.map((group) => ({ group, rows: rowsForGroup(group) })),
    []
  );

  return (
    <div
      className="cheatsheet-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="cheatsheet"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cheatsheet-header">
          <h2>Keyboard Shortcuts</h2>
          <button
            className="icon-btn"
            aria-label="Close cheatsheet"
            title="Close (Esc)"
            onClick={onClose}
          >
            &#10005;
          </button>
        </header>
        <div className="cheatsheet-sections">
          {sections.map(({ group, rows }) => (
            <section className="cheatsheet-section" key={group}>
              <h3>{group}</h3>
              {rows.map((row) => (
                <div className="cheatsheet-row" key={row.label}>
                  <span className="cheatsheet-label">{row.label}</span>
                  <span className="cheatsheet-keys">
                    {row.chords.map((chord) => (
                      <kbd key={chord}>{chord}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
