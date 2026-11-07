import type { PluginInfo } from "../../model/Plugins.js";
import { requestJson } from "./request.js";

export function fetchPlugins(signal?: AbortSignal) {
  return requestJson<readonly PluginInfo[]>("/plugins", { signal });
}

export function togglePluginVersion(uuid: string, version: string) {
  return requestJson<{ active: boolean }>(
    `/plugins/${encodeURIComponent(uuid)}/${encodeURIComponent(version)}/toggle`,
    { method: "POST" },
  );
}
