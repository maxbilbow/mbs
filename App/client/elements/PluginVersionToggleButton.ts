/** @import { PackVersionInfo, PluginInfo } from "../../model/Plugins.ts"; */

import { togglePluginVersion } from "../api/Plugins.js";

// declare module "react/jsx-runtime" {
//     namespace JSX {
//         interface IntrinsicElements {
//             "plugin-version-toggle": HTMLAttributes<PluginVersionToggleButton>;
//         }
//     }
// }

class PluginVersionToggleButton extends HTMLButtonElement {
    readonly #icon;
    constructor() {
        super();
        this.#icon = document.createElement("i");
    }

    /**
     * 
     * @param {boolean} active 
     */
    #setActive(active: boolean) {
        this.classList.toggle("plugin-version--active", active);
        this.classList.toggle("plugin-version--inactive", !active);
        this.#icon.classList.toggle("la-toggle-on", active);
        this.#icon.classList.toggle("la-toggle-off", !active);
    }

    connectedCallback() {
        const versionLabel = document.createElement("span");
        versionLabel.textContent = this.dataset.version ?? "";
        this.#icon.classList.add("la");
        this.append(versionLabel, this.#icon);
        this.#setActive(this.dataset.active === "true");
        this.addEventListener("click", async () => {
            const { uuid, version } = this.dataset;
            if (!(uuid && version)) {
                console.error("Missing uuid or version in dataset");
                return;
            }
            const [response, error] = await togglePluginVersion(uuid, version);
            if (error) {
                console.error("Failed to toggle plugin version:", error);
            } else {
                const { active } = response;
                this.#setActive(active);
            }
        });

    }
}

customElements.define("plugin-version-toggle", PluginVersionToggleButton, { extends: "button" });
