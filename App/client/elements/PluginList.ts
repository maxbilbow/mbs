import type { PluginInfo } from "../../model/Plugins.js";

class PluginList extends HTMLElement {

    async connectedCallback() {
        const pluginResponse = await fetch("/api/plugins");
        /**
         * @type {PluginInfo[]}
         */
        const plugins = await pluginResponse.json() as readonly PluginInfo[];
        this.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Versions</th>
                </tr>
            </thead>
            <tbody>
                ${plugins.map(plugin => `
                    <tr>
                        <td>${plugin.name}</td>
                        <td>${plugin.type === "behaviour" ? "Behaviour Pack" : "Resource Pack"}</td>
                        <td class="version-list">${plugin.versions.map(getVersion).join('')}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        `;
    }
}

/**
 * @param {PackVersionInfo} param0
 */
function getVersion({ uuid, version, active }: PluginInfo["versions"][number]) {
    return `<button is="plugin-version-toggle" data-uuid="${uuid}" data-version="${version.join('.')}" data-active="${active}"></button>`;
}

customElements.define("plugin-list", PluginList);