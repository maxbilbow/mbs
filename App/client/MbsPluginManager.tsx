import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./MbsPluginManager.css";
import { PluginList } from "./PluginList/PluginList.js";

export function App() {
  return (
    <div className="App">
      <h1>Minecraft Bedrock Plugin Manager</h1>
      <mbs-status-panel />
      <PluginList />
    </div>
  );
}

class MbsPluginManager extends HTMLElement {
  readonly #root = createRoot(this);

  connectedCallback() {
    this.#root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

customElements.define("mbs-plugin-manager", MbsPluginManager);
