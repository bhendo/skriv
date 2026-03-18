import { type FC } from "react";

interface TitleBarProps {
  fileName: string;
  isModified: boolean;
}

export const TitleBar: FC<TitleBarProps> = ({ fileName, isModified }) => {
  return (
    <div
      data-tauri-drag-region
      style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        WebkitUserSelect: "none",
        borderBottom: "1px solid #e0e0e0",
        backgroundColor: "#fafafa",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <span style={{ fontSize: 13, color: "#555" }}>
        {fileName}
        {isModified && (
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "#999",
              marginLeft: 6,
              verticalAlign: "middle",
            }}
          />
        )}
      </span>
    </div>
  );
};
