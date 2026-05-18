import type { PluginInfo } from "../../model/Plugins.js";
import { BASE_URL } from "./config.js";


export async function fetchPlugins() {
    const response = await fetch(`${BASE_URL}/plugins`)

    if (!response.ok) {
        return [null, new Error(`Failed to fetch plugins: ${response.statusText}`)] as const;
    }
    return [await response.json() as readonly PluginInfo[], null] as const;
}

export async function togglePluginVersion(uuid: string, version: string) {
    const response = await fetch(`${BASE_URL}/plugins/${uuid}/${version}/toggle`, {
        method: "POST",
    });

    if (!response.ok) {
        return [null, new Error(`Failed to toggle plugin version: ${response.statusText}`)] as const;
    }
    return [await response.json() as { active: boolean }, null] as const;
}