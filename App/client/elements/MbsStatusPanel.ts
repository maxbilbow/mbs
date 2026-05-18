/** @import { PackVersionInfo, PluginInfo } from "../../model/Plugins.ts"; */
import type { HTMLAttributes } from "react";
import "./MbsStartButton.js";
import "./MbsStopButton.js";
import { getServerStatus } from "../api/MbsCtrl.js";

declare module "react/jsx-runtime" {
    namespace JSX {
        interface IntrinsicElements {
            "mbs-status-panel": HTMLAttributes<MbsStatusPanel>;
        }
    }
}

class MbsStatusPanel extends HTMLElement {


    async connectedCallback() {
        const statusContainer = document.createElement("div");
        const buttonContainer = document.createElement("div");
        statusContainer.textContent = "Checking server status...";
        this.append(statusContainer, buttonContainer);

        const [serverStatus, error] = await getServerStatus();
        if (error) {
            statusContainer.textContent = `Error fetching server status: ${error.message}`;
            return;
        }
        const { version, status } = serverStatus;
        statusContainer.textContent = `Server version: ${version}, Status: ${status}`;

        buttonContainer.innerHTML = `
        <button is="mbs-start-button">${status === "active" ? "Restart" : "Start"} Server</button>
        <button is="mbs-stop-button"${status !== "active" ? " disabled" : ""}">Stop Server</button>
        `;

    }
}

customElements.define("mbs-status-panel", MbsStatusPanel);
