import type { PluginInfo } from "../../model/Plugins.js";
import { jsonBody, requestJson } from "./request.js";

export function fetchPlugins(signal?: AbortSignal) {
  return requestJson<readonly PluginInfo[]>("/plugins", { signal });
}

export function togglePluginVersion(uuid: string, version: string) {
  return requestJson<{ active: boolean }>(
    `/plugins/${encodeURIComponent(uuid)}/${encodeURIComponent(version)}/toggle`,
    { method: "POST" },
  );
}

export function reorderPlugins(uuids: readonly string[]) {
  return requestJson<{ success: boolean }>(
    "/plugins/order",
    jsonBody({ uuids }),
  );
}

export function setPluginFavourite(
  uuids: readonly string[],
  favourite: boolean,
) {
  return requestJson<{ success: boolean }>(
    "/plugins/favourite",
    jsonBody({ uuids, favourite }),
  );
}
