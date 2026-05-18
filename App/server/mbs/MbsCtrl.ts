import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Logger } from "tslog";

const VERSION_FILE = fileURLToPath(import.meta.resolve("#current_version.txt"));
const BEDROCK_SERVER_FILE = fileURLToPath(import.meta.resolve("#bedrock_server"));
const logger = new Logger({ name: "MbsCtrl", stylePrettyLogs: false });

export async function restart() {
    stop();
    await setTimeout(5_000);
    await start();
}

export async function start() {
    logger.debug("Starting server...");
    spawn(BEDROCK_SERVER_FILE, [], { detached: true, stdio: "ignore" }).unref();
}

export function stop() {
    logger.debug("Stopping server...");
    // stop the server if it's running 
    spawnSync("pkill", ["-f", "bedrock_server"], { stdio: "ignore" });
}

export function getStatus() {
    const version = getCurrentVersion();
    const isRunning = checkIfServerIsRunning();
    return { version, status: isRunning ? "active" : "stopped" };
}

function getCurrentVersion() {
    try {
        return readFileSync(VERSION_FILE, "utf-8").trim();
    } catch (error) {
        logger.error("Error reading version file:", error);
        return "unknown";
    }
}

function checkIfServerIsRunning() {
    try {
        const result = spawnSync("pgrep", ["-f", BEDROCK_SERVER_FILE], { encoding: "utf-8" });
        return result.status === 0;
    } catch (error) {
        logger.error("Error checking server status:", error);
        return false;
    }
}