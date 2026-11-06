import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isUpdateFile,
  latestRelease,
  trackedUpdatePaths,
  validateArchiveEntries,
  commitRuntimeUpdate,
} from "../scripts/update-server.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("updates preserve local configuration, worlds and development packs", () => {
  for (const name of [
    "allowlist.json",
    "permissions.json",
    "server.properties",
    "worlds/level/db/file",
    "development_behavior_packs/__Max/scripts/main.js",
    "development_resource_packs/pack/manifest.json",
    "development_skin_packs/pack/skins.json",
    "config/default/permissions.json",
  ]) {
    assert.equal(isUpdateFile(name), false, name);
  }
  assert.equal(isUpdateFile("behavior_packs/vanilla/manifest.json"), true);
});

test("archive validation rejects traversal and missing executable", () => {
  validateArchiveEntries([
    "bedrock_server",
    "behavior_packs/",
    "behavior_packs/manifest.json",
  ]);
  for (const name of [
    "../package.json",
    "/etc/passwd",
    "a/../../mbs",
    "a\\..\\file",
  ]) {
    assert.throws(
      () => validateArchiveEntries(["bedrock_server", name]),
      /Unsafe archive/,
    );
  }
  assert.throws(
    () => validateArchiveEntries(["manifest.json"]),
    /no bedrock_server/,
  );
});

test("only tracked files overwritten by the update are eligible for commits", () => {
  assert.deepEqual(
    trackedUpdatePaths(
      [
        "bedrock/current_version.txt",
        "bedrock/allowlist.json",
        "bedrock/release-notes.txt",
        "bedrock/development_behavior_packs/__Max/manifest.json",
        "App/server/start.ts",
      ],
      [
        "release-notes.txt",
        "allowlist.json",
        "development_behavior_packs/__Max/manifest.json",
      ],
    ),
    ["bedrock/current_version.txt", "bedrock/release-notes.txt"],
  );
});

test("release selection sorts versions semantically", () => {
  assert.equal(
    latestRelease({
      "1.9.0": { linux: { url: "one" } },
      "1.10.0": { linux: { url: "two" } },
    })[0],
    "1.10.0",
  );
  assert.throws(() => latestRelease({}), /No valid/);
});

test("update commits exclude unrelated staged changes and never add untracked files", () => {
  const root = mkdtempSync(join(tmpdir(), "mbs-git-test-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.name", "MBS Test");
    git("config", "user.email", "mbs-test@example.invalid");
    mkdirSync(join(root, "bedrock"));
    writeFileSync(join(root, "bedrock/current_version.txt"), "1.0.0");
    writeFileSync(join(root, "bedrock/versioned.txt"), "old runtime");
    writeFileSync(join(root, "application.txt"), "old app");
    git("add", ".");
    git(
      "commit",
      "-q",
      "-m",
      "Fixture\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>",
    );
    writeFileSync(join(root, "application.txt"), "staged app work");
    git("add", "application.txt");
    writeFileSync(join(root, "bedrock/current_version.txt"), "1.0.1");
    writeFileSync(join(root, "bedrock/versioned.txt"), "updated runtime");
    writeFileSync(join(root, "bedrock/untracked.txt"), "untracked");
    commitRuntimeUpdate("1.0.1", ["versioned.txt", "untracked.txt"], root);
    assert.deepEqual(
      git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")
        .trim()
        .split("\n"),
      ["bedrock/current_version.txt", "bedrock/versioned.txt"],
    );
    assert.equal(
      git("diff", "--cached", "--name-only").trim(),
      "application.txt",
    );
    assert.equal(git("ls-files", "bedrock/untracked.txt"), "");
    assert.ok(
      git("log", "-1", "--format=%B").includes("Co-authored-by: Copilot"),
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
