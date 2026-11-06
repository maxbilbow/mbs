import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  BEDROCK_EXECUTABLE,
  BEDROCK_ROOT,
  REPO_ROOT,
  VERSION_FILE,
} from "./paths.ts";

export function getServerPids(): number[] {
  const pattern = `^${BEDROCK_EXECUTABLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`;
  const result = spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status === 1) return [];
  if (result.status !== 0) throw new Error(`pgrep failed: ${result.stderr}`);
  return result.stdout.trim().split(/\s+/).map(Number);
}

export function getStatus() {
  return {
    version: readFileSync(VERSION_FILE, "utf8").trim(),
    status: getServerPids().length ? "active" : "stopped",
  };
}

export async function stop() {
  const pids = getServerPids();
  for (const pid of pids) process.kill(pid, "SIGINT");
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!getServerPids().some((pid) => pids.includes(pid))) return;
    await setTimeout(500);
  }
  throw new Error(
    "Bedrock did not stop within 30 seconds; refusing to proceed.",
  );
}

export async function start() {
  if (getServerPids().length) return;
  const logs = join(REPO_ROOT, "logs");
  mkdirSync(logs, { recursive: true });
  const output = openSync(join(logs, "bedrock.log"), "a");
  const server = spawn(BEDROCK_EXECUTABLE, [], {
    cwd: BEDROCK_ROOT,
    detached: true,
    stdio: ["ignore", output, output],
  });
  closeSync(output);
  await new Promise<void>((resolve, reject) => {
    server.once("spawn", resolve);
    server.once("error", reject);
  });
  server.unref();
  await setTimeout(2_000);
  if (!getServerPids().length) {
    throw new Error("Bedrock exited during startup; see logs/bedrock.log.");
  }
}

export async function restart() {
  await stop();
  await start();
}

export async function runCommand(command: string | undefined) {
  switch (command) {
    case "start":
      return start();
    case "stop":
      return stop();
    case "restart":
      return restart();
    case "status":
      console.log(getStatus());
      return;
    default:
      throw new Error("Use start, stop, restart, or status.");
  }
}

if (import.meta.main) await runCommand(process.argv[2]);
