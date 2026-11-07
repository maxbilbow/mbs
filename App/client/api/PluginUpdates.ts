import type {
  PluginInstallPreview,
  PluginInstallResult,
  PluginSourceInput,
  PluginUpdateCheck,
  PluginUpdateList,
} from "../../model/PluginUpdates.js";
import { jsonBody, requestJson } from "./request.js";

export function fetchPluginSources(signal?: AbortSignal) {
  return requestJson<PluginUpdateList>("/plugins/updates", { signal });
}

export function savePluginSource(input: PluginSourceInput, id?: string) {
  return requestJson<PluginUpdateList>(
    `/plugins/updates/sources${id ? `/${encodeURIComponent(id)}` : ""}`,
    { ...jsonBody(input), method: id ? "PUT" : "POST" },
  );
}

export function removePluginSource(id: string) {
  return requestJson<PluginUpdateList>(
    `/plugins/updates/sources/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function checkPluginUpdates() {
  return requestJson<PluginUpdateCheck[]>("/plugins/updates/check", {
    method: "POST",
  });
}

export function stagePluginUpdate(id: string, releaseId: string) {
  return requestJson<PluginInstallPreview>(
    `/plugins/updates/sources/${encodeURIComponent(id)}/stage`,
    jsonBody({ releaseId }),
  );
}

export function importPluginArchive(
  file: File,
  sourceId?: string,
  releaseId?: string,
) {
  const query = new URLSearchParams();
  if (sourceId) query.set("sourceId", sourceId);
  if (releaseId) query.set("releaseId", releaseId);
  return requestJson<PluginInstallPreview>(`/plugins/updates/import?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
}

export function cancelPluginPreview(token: string) {
  return requestJson<{ success: boolean }>(
    `/plugins/updates/stages/${encodeURIComponent(token)}`,
    { method: "DELETE" },
  );
}

export function installPluginPreview(token: string) {
  return requestJson<PluginInstallResult>(
    `/plugins/updates/stages/${encodeURIComponent(token)}/install`,
    jsonBody({ confirmed: true }),
  );
}
