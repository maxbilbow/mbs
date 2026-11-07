import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { REPO_ROOT } from "./paths.ts";

const PORT = 8081;
const ENTRY = "App/server/start.ts";
const LOG_FILE = join(REPO_ROOT, "logs", "web-api.log");

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with status ${result.status}`);
}

/** Manager processes launched from this checkout, however they were started. */
export function getManagerPids(): number[] {
  const result = spawnSync("pgrep", ["-f", `^\\S*node .*${ENTRY}( |$)`], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status === 1) return [];
  if (result.status !== 0) throw new Error(`pgrep failed: ${result.stderr}`);
  return result.stdout
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((pid) => {
      try {
        return readlinkSync(`/proc/${pid}/cwd`) === REPO_ROOT;
      } catch {
        return false;
      }
    });
}

async function responding() {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/api/mbs/status`, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function deploy() {
  run("npm", ["run", "build"]);
  const outputPath = process.env.CADDY_OUTPUT_PATH;
  if (outputPath) run("rsync", ["--delete", "-r", "./App/www/", outputPath]);
}

export async function stop() {
  const pids = getManagerPids();
  for (const pid of pids) process.kill(pid, "SIGTERM");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!getManagerPids().some((pid) => pids.includes(pid))) break;
    await setTimeout(500);
  }
  for (const pid of getManagerPids().filter((pid) => pids.includes(pid)))
    process.kill(pid, "SIGKILL");
  if (pids.length)
    console.log(`Stopped management server (${pids.join(", ")}).`);
  else console.log("Management server is not running.");
}

export async function start() {
  // Build before stopping so a broken build leaves the current server running.
  deploy();
  await stop();
  if (await responding())
    throw new Error(`Port ${PORT} is still in use by another process.`);
  mkdirSync(join(REPO_ROOT, "logs"), { recursive: true });
  const output = openSync(LOG_FILE, "a");
  const server = spawn(process.execPath, ["--env-file-if-exists=.env", ENTRY], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", output, output],
  });
  closeSync(output);
  await new Promise<void>((resolve, reject) => {
    server.once("spawn", resolve);
    server.once("error", reject);
  });
  server.unref();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await responding()) {
      console.log(
        `Management server running on port ${PORT} (pid ${server.pid}); logs in logs/web-api.log.`,
      );
      return;
    }
    if (server.exitCode !== null || !getManagerPids().includes(server.pid!))
      break;
    await setTimeout(500);
  }
  throw new Error("Management server did not start; see logs/web-api.log.");
}

export async function runCommand(command: string | undefined) {
  switch (command) {
    case "start":
    case "restart":
      return start();
    case "stop":
      return stop();
    case "deploy":
      return deploy();
    case "status": {
      const pids = getManagerPids();
      console.log({
        status: pids.length ? "active" : "stopped",
        pids,
        responding: await responding(),
      });
      return;
    }
    default:
      throw new Error("Use start, stop, restart, deploy, or status.");
  }
}

if (import.meta.main) await runCommand(process.argv[2]);
