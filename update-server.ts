import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compare, gt } from "semver";
import { Logger } from "tslog";
import { setTimeout } from "node:timers/promises";

const DOWNLOAD_LIST_URL = "https://raw.githubusercontent.com/kittizz/bedrock-server-downloads/main/bedrock-server-downloads.json";
const DOWNLOAD_DIR = ".tmp";
const DOWNLOAD_FILE = "bedrock-server.zip";
const VERSION_FILE = "current_version.txt";
const EXCLUDED_FILES = [
    "permissions.json",
    "server.properties",
    "worlds",
    "development_resource_packs",
    "development_behavior_packs",
];

const logger = new Logger({ name: "UpdateBedrockServer", stylePrettyLogs: false });
// logger.attachTransport((logObj) => {
//   appendFileSync("logs/logs.txt", JSON.stringify(logObj) + "\n");
// });

await update();

/**
 * This runs on a cronjob
 * To edit the cronjob, run `crontab -e`. Currently it is set to run at 3am every day. You can change the schedule as needed:
 *  `0 3 * * * node /home/max/mbs/update-server.ts`
 */
async function update() {
    validateEnv();

    const [newVersion, latestDownload] = await fetchLatestVersion();
    if (!isNewerVersion(newVersion)) {
        return;
    }
    prepare();
    await downloadServer(latestDownload);
    await unzipServer();
    copyFiles(newVersion);
    await startServer();
    cleanup();

    process.exitCode = 0;
    process.exit();
}

function prepare() {
    logger.debug("Stopping server...");
    // stop the server if it's running 
    spawnSync("pkill", ["-f", "bedrock_server"], { stdio: "inherit" });
    commitChanges("Commiting before server update", false);
}

function cleanup() {
    commitChanges("Server update completed", true);
}

function commitChanges(message: string, push: boolean) {
    logger.debug("Committing changes...");
    // commit any uncommitted changes to avoid losing them
    spawnSync("git", ["add", "-A"], { stdio: "inherit" });
    spawnSync("git", ["commit", "-m", message], { stdio: "inherit" });
    if (push) {
        spawnSync("git", ["push"], { stdio: "inherit" });
    }
}
function validateEnv() {
    process.chdir(import.meta.dirname);

    if (process.cwd() !== path.resolve(import.meta.dirname)) {
        throw new Error("This script must be run from the project root.");
    }

    if (!existsSync(".tmp")) {
        mkdirSync(".tmp");
    }

    if (!existsSync("logs")) {
        mkdirSync("logs");
    }
}

async function fetchLatestVersion() {
    logger.debug("Fetching latest version info...");
    const response = await fetch(DOWNLOAD_LIST_URL);
    const { release } = await response.json() as { release: Record<string, { linux: { url: string } }> };

    // logger.debug("Downloads:", release);

    const latestDownload = Object.entries(release).sort(([aVersion], [bVersion]) => compare(aVersion, bVersion)).pop()

    if (!latestDownload) {
        throw new Error("No valid download found.");
    }
    logger.debug("Latest version:", latestDownload[0]);

    return latestDownload;
}

function isNewerVersion(latestVersion: string) {
    if (!existsSync(VERSION_FILE)) {
        writeFileSync(VERSION_FILE, "0.0.0", "utf-8");
    }

    const currentVersion = readFileSync(VERSION_FILE, "utf-8");
    if (gt(latestVersion, currentVersion)) {
        logger.debug(`New version available: ${latestVersion} > ${currentVersion}`);
        return true;
    } else {
        logger.debug(`No new version available: ${latestVersion} <= ${currentVersion}`);
        return false;
    }
}
async function downloadServer(latestDownload: { linux: { url: string } }) {

    const downloadResponse = await fetch(latestDownload.linux.url);
    if (!downloadResponse.ok) {
        throw new Error(`Failed to download server software: ${downloadResponse.statusText}`);
    }

    const buffer = await downloadResponse.arrayBuffer();
    const filePath = path.join(DOWNLOAD_DIR, DOWNLOAD_FILE);
    writeFileSync(filePath, new Uint8Array(buffer));
    logger.info(`Server software downloaded and saved to ${filePath}`);
}

async function unzipServer() {
    const zipPath = path.join(DOWNLOAD_DIR, DOWNLOAD_FILE);
    const unzipDir = DOWNLOAD_DIR;

    if (!existsSync(unzipDir)) {
        mkdirSync(unzipDir);
    }

    const { spawnSync } = await import("node:child_process");
    const unzipProcess = spawnSync("unzip", ["-o", zipPath, "-d", unzipDir]);

    if (unzipProcess.status !== 0) {
        throw new Error(`Failed to unzip server software: ${unzipProcess.stderr.toString()}`);
    }

    rmSync(zipPath);
}

function copyFiles(version: string) {
    for (const file of readdirSync(DOWNLOAD_DIR)) {
        if (EXCLUDED_FILES.includes(file)) {
            continue;
        }
        logger.debug(`Removing old - ${file}...`);
        rmSync(path.join(process.cwd(), file), { force: true, recursive: true });

        logger.debug(`Copying new - ${file}...`);
        const sourcePath = path.join(DOWNLOAD_DIR, file);
        const destPath = path.join(process.cwd(), file);
        renameSync(sourcePath, destPath);
    }

    // Update version file
    writeFileSync(VERSION_FILE, version, "utf-8");
}

async function startServer() {
    chmodSync("./bedrock_server", 0o755);
    const server = spawn(path.join(import.meta.dirname, "bedrock_server"), [], { detached: true, stdio: "inherit" });
    server.unref();

    // allow the server some time to start before exiting the script
    await setTimeout(10_000);
}