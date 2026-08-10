import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { watchSystemThemeForMermaid } from "./mermaid/renderer";
import "./theme/colors.css";
import "./theme/skriv.css";

watchSystemThemeForMermaid();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
