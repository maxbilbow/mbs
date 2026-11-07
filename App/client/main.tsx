import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./MbsPluginManager.js";

const container = document.getElementById("app");
if (!container) throw new Error("Dashboard root not found.");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
