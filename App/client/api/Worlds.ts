import type {
  CreateWorldInput,
  WorldList,
  WorldProperties,
} from "../../model/Worlds.js";
import { jsonBody, requestJson } from "./request.js";

export function fetchWorlds(signal?: AbortSignal) {
  return requestJson<WorldList>("/worlds", { signal });
}

export function activateWorld(name: string) {
  return requestJson<WorldList>("/worlds/activate", jsonBody({ name }));
}

export function createWorld(input: CreateWorldInput) {
  return requestJson<WorldList>("/worlds", jsonBody(input));
}

export function fetchWorldProperties(name: string, signal?: AbortSignal) {
  return requestJson<WorldProperties>(
    `/worlds/properties?name=${encodeURIComponent(name)}`,
    { signal },
  );
}

export function saveWorldProperties(
  name: string,
  overrides: Record<string, string>,
  revision: string,
) {
  return requestJson<WorldProperties>("/worlds/properties", {
    ...jsonBody({ name, overrides, revision }),
    method: "PUT",
  });
}
