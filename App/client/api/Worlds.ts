import type { CreateWorldInput, WorldList } from "../../model/Worlds.js";
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
