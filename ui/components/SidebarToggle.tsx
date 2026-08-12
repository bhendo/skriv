import { displayChord } from "../utils/shortcuts";

interface SidebarToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function SidebarToggle({ visible, onToggle }: SidebarToggleProps) {
  return (
    <button
      className="sidebar-toggle"
      aria-label="Toggle sidebar"
      aria-pressed={visible}
      title={`Toggle sidebar (${displayChord("toggle-sidebar")})`}
      onClick={onToggle}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
        <line x1="6" y1="2.75" x2="6" y2="13.25" />
      </svg>
    </button>
  );
}
