/** @import { PackVersionInfo, PluginInfo } from "../../model/Plugins.ts"; */

import { stopServer } from "../api/MbsCtrl.js";

class MbsStartButton extends HTMLButtonElement {
    #icon = document.createElement("i");

    connectedCallback() {
        this.#icon.classList.add("la", "la-stop");
        this.addEventListener("click", async () => {
            const [response, error] = await stopServer();
            if (error) {
                console.error("Failed to start server", error);
                return;
            }
            console.log("Server started successfully", response);
            location.reload();
        });
    };
}

customElements.define("mbs-stop-button", MbsStartButton, { extends: "button" });
