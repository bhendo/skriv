import { type FC } from "react";

interface ReloadBannerProps {
  visible: boolean;
  onReload: () => void;
  onDismiss: () => void;
}

export const ReloadBanner: FC<ReloadBannerProps> = ({ visible, onReload, onDismiss }) => {
  if (!visible) return null;

  return (
    <div
      style={{
        padding: "8px 16px",
        backgroundColor: "var(--crepe-color-surface-low, #fffbeb)",
        borderBottom: "1px solid var(--crepe-color-outline, #fde68a)",
        color: "var(--crepe-color-on-surface, #92400e)",
        fontSize: 13,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>File changed on disk.</span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onReload}
          style={{
            background: "none",
            border: "1px solid currentColor",
            borderRadius: 4,
            cursor: "pointer",
            color: "inherit",
            fontSize: 12,
            padding: "2px 8px",
          }}
        >
          Reload
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "inherit",
            fontSize: 16,
          }}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
};
