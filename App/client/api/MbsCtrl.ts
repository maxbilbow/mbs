import { requestJson, requestText } from "./request.js";

export type ServerStatus = { version: string; status: string };

export function getServerStatus(signal?: AbortSignal) {
  return requestJson<ServerStatus>("/mbs/status", { signal });
}

export function startServer() {
  return requestText("/mbs/start", { method: "POST" });
}

export function stopServer() {
  return requestText("/mbs/stop", { method: "POST" });
}
