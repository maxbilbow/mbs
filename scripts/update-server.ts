import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix } from "node:path";
import { compare, gt, valid } from "semver";
import { stop, start } from "./bedrock.ts";
import { BEDROCK_ROOT, REPO_ROOT, VERSION_FILE } from "./paths.ts";

const DOWNLOAD_LIST_URL =
  "https://raw.githubusercontent.com/kittizz/bedrock-server-downloads/main/bedrock-server-downloads.json";
const PRESERVED = new Set([
  "permissions.json",
  "allowlist.json",
  "server.properties",
  "worlds",
  "development_resource_packs",
  "development_behavior_packs",
  "development_skin_packs",
  "config",
  ".git",
  ".gitignore",
  "current_version.txt",
]);

export function isUpdateFile(name: string) {
  return !PRESERVED.has(name.split("/")[0]);
}

export function validateArchiveEntries(entries: string[]) {
  for (const entry of entries) {
    if (
      !entry ||
      entry.startsWith("/") ||
      entry.includes("\\") ||
      entry.split("/").includes("..") ||
      posix.normalize(entry).startsWith("../")
    ) {
      throw new Error(`Unsafe archive entry: ${entry}`);
    }
  }
  if (!entries.includes("bedrock_server"))
    throw new Error("Archive contains no bedrock_server.");
}

export function latestRelease(
  release: Record<string, { linux: { url: string } }>,
) {
  const latest = Object.entries(release)
    .filter(([version]) => valid(version))
    .sort(([a], [b]) => compare(a, b))
    .pop();
  if (!latest) throw new Error("No valid Bedrock release found.");
  return latest;
}

function command(program: string, args: string[], cwd = REPO_ROOT) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${program} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

export function trackedUpdatePaths(
  tracked: string[],
  updatedEntries: string[],
) {
  const updated = new Set(
    updatedEntries.filter(isUpdateFile).map((entry) => `bedrock/${entry}`),
  );
  updated.add("bedrock/current_version.txt");
  return tracked.filter((file) => updated.has(file));
}

export function commitRuntimeUpdate(
  version: string,
  entries: string[],
  repository = REPO_ROOT,
) {
  const tracked = command(
    "git",
    ["ls-files", "-z", "--", "bedrock/"],
    repository,
  )
    .split("\0")
    .filter(Boolean);
  const files = trackedUpdatePaths(tracked, entries);
  if (!files.length) return;
  const changed = command(
    "git",
    ["diff", "HEAD", "--name-only", "-z", "--", ...files],
    repository,
  )
    .split("\0")
    .filter(Boolean);
  if (!changed.length) return;
  // --only leaves unrelated staged changes out of this commit.
  command(
    "git",
    [
      "commit",
      "--only",
      "-m",
      `Update Bedrock server to ${version}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`,
      "--",
      ...changed,
    ],
    repository,
  );
}

export async function update({ checkOnly = false } = {}) {
  const response = await fetch(DOWNLOAD_LIST_URL);
  if (!response.ok)
    throw new Error(`Release lookup failed: ${response.statusText}`);
  const { release } = (await response.json()) as {
    release: Record<string, { linux: { url: string } }>;
  };
  const [version, download] = latestRelease(release);
  const current = existsSync(VERSION_FILE)
    ? readFileSync(VERSION_FILE, "utf8").trim()
    : "0.0.0";
  if (checkOnly) {
    console.log(
      `Installed: ${current}; latest release: ${version}. No changes made.`,
    );
    return;
  }
  if (!gt(version, current)) {
    console.log(`Bedrock ${current} is up to date.`);
    return;
  }
  const tracked = command("git", [
    "ls-files",
    "-z",
    "--",
    "bedrock/current_version.txt",
  ]);
  if (!tracked)
    throw new Error(
      "Commit the bedrock/ migration before running automatic updates.",
    );

  const temporaryRoot = join(REPO_ROOT, ".tmp");
  mkdirSync(temporaryRoot, { recursive: true });
  const staging = mkdtempSync(join(temporaryRoot, "bedrock-update-"));
  const archive = join(staging, "bedrock-server.zip");
  const extracted = join(staging, "extracted");
  try {
    const downloaded = await fetch(download.linux.url);
    if (!downloaded.ok)
      throw new Error(`Download failed: ${downloaded.statusText}`);
    writeFileSync(archive, new Uint8Array(await downloaded.arrayBuffer()));
    const entries = command("unzip", ["-Z1", archive]).trim().split("\n");
    validateArchiveEntries(entries);
    const files = trackedUpdatePaths(
      command("git", ["ls-files", "-z", "--", "bedrock/"])
        .split("\0")
        .filter(Boolean),
      entries,
    );
    if (
      files.length &&
      command("git", ["diff", "HEAD", "--name-only", "--", ...files]).trim()
    ) {
      throw new Error(
        "Tracked update files have local changes; commit or resolve them before updating.",
      );
    }
    command("unzip", ["-q", archive, "-d", extracted]);
    for (const entry of entries) {
      if (lstatSync(join(extracted, entry)).isSymbolicLink()) {
        throw new Error(`Archive contains a symbolic link: ${entry}`);
      }
    }
    await stop();
    for (const entry of entries.filter(
      (entry) => !entry.endsWith("/") && isUpdateFile(entry),
    )) {
      mkdirSync(dirname(join(BEDROCK_ROOT, entry)), { recursive: true });
      cpSync(join(extracted, entry), join(BEDROCK_ROOT, entry), {
        recursive: true,
      });
    }
    chmodSync(join(BEDROCK_ROOT, "bedrock_server"), 0o755);
    await start();
    writeFileSync(VERSION_FILE, version, "utf8");
    commitRuntimeUpdate(version, entries);
    console.log(`Updated Bedrock to ${version}. Git pushes are manual.`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (import.meta.main)
  await update({ checkOnly: process.argv.includes("--check") });
