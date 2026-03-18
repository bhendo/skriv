import { type FC } from "react";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export const ErrorBanner: FC<ErrorBannerProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div
      style={{
        padding: "8px 16px",
        backgroundColor: "var(--crepe-color-surface-low, #fef2f2)",
        borderBottom: "1px solid var(--crepe-color-outline, #fecaca)",
        color: "var(--crepe-color-error, #991b1b)",
        fontSize: 13,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--crepe-color-error, #991b1b)",
          fontSize: 16,
        }}
      >
        x
      </button>
    </div>
  );
};
