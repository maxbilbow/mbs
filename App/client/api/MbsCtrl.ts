import { requestJson, requestText } from "./request.js";
import type { LogSnapshot } from "../../model/Logs.js";

export type ServerStatus = { version: string; status: string };

export function getServerStatus(signal?: AbortSignal) {
  return requestJson<ServerStatus>("/mbs/status", { signal });
}

export function getServerLogs(signal?: AbortSignal) {
  return requestJson<LogSnapshot>("/mbs/logs", {
    signal,
    cache: "no-store",
  });
}

export function startServer() {
  return requestText("/mbs/start", { method: "POST" });
}

export function stopServer() {
  return requestText("/mbs/stop", { method: "POST" });
}
