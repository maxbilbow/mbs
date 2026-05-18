/** @import { PackVersionInfo, PluginInfo } from "../../model/Plugins.ts"; */

import { startServer } from "../api/MbsCtrl.js";

class MbsStartButton extends HTMLButtonElement {
    #icon = document.createElement("i");

    connectedCallback() {
        this.#icon.classList.add("la", "la-play");
        this.addEventListener("click", async () => {
            const [response, error] = await startServer();
            if (error) {
                console.error("Failed to start server", error);
                return;
            }
            console.log("Server started successfully", response);
            location.reload();
        });
    }
}

customElements.define("mbs-start-button", MbsStartButton, { extends: "button" });
