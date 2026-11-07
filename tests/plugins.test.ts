import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { createPluginStore } from "../App/server/data/Plugins.ts";
import { createApp } from "../App/server/app.ts";
import {
  buildPlugins,
  deployPlugins,
  validateManifest,
} from "../scripts/plugins.ts";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const uuid = "597d3dd8-5075-4785-96ef-36ed2359a2b9";
const exampleUuid = "e7bfa9d8-b941-4d7d-9718-b4cafc39e535";

function sourceFixture() {
  const root = mkdtempSync(join(tmpdir(), "mbs-plugin-source-"));
  const sourceRoot = join(root, "sources");
  const outputRoot = join(root, "build");
  mkdirSync(sourceRoot);
  cpSync(
    resolve(import.meta.dirname, "../plugins/example"),
    join(sourceRoot, "example"),
    { recursive: true },
  );
  return { root, sourceRoot, outputRoot };
}

function addSourcePack(
  sourceRoot: string,
  name: string,
  kind: "behavior" | "resource",
  entries = kind === "behavior" ? ["scripts/main.js"] : [],
) {
  const source = join(sourceRoot, name, kind);
  mkdirSync(source, { recursive: true });
  const manifest = {
    format_version: 2,
    header: { uuid: randomUUID(), version: [1, 0, 0] },
    modules: entries.length
      ? entries.map((entry) => ({
          uuid: randomUUID(),
          version: [1, 0, 0],
          type: "script",
          language: "javascript",
          entry,
        }))
      : [
          {
            uuid: randomUUID(),
            version: [1, 0, 0],
            type: kind === "behavior" ? "data" : "resources",
          },
        ],
  };
  writeFileSync(join(source, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(source, "pack_icon.png"), "fixture asset");
  for (const entry of entries) {
    const directory = dirname(join(source, entry));
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "label.ts"),
      'export const label: string = "Fixture compiled";',
    );
    writeFileSync(
      join(source, entry.slice(0, -3) + ".ts"),
      'import { world } from "@minecraft/server"; import { label } from "./label.js"; const message: string = label; world.sendMessage(message);',
    );
  }
  return { source, manifest };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mbs-test-"));
  writeFileSync(join(root, "server.properties"), "level-name=Bedrock level\n");
  for (const name of [
    "development_behavior_packs",
    "development_resource_packs",
    "worlds/Bedrock level",
  ]) {
    mkdirSync(join(root, name), { recursive: true });
  }
  for (const type of ["behaviour", "resource"]) {
    writeFileSync(
      join(root, `worlds/Bedrock level/world_${type}_packs.json`),
      "[]",
    );
  }
  for (const version of [1, 2]) {
    const pack = join(root, "development_behavior_packs", `pack${version}`);
    mkdirSync(pack);
    writeFileSync(
      join(pack, "manifest.json"),
      JSON.stringify({
        header: {
          uuid,
          name: "Test",
          version: [1, 0, version],
          description: "Test pack",
        },
      }),
    );
  }
  return root;
}

test("pack activation replaces an older version and deactivation persists", () => {
  const root = fixture();
  try {
    const store = createPluginStore(root);
    store.activatePlugin("behaviour", uuid, [1, 0, 1]);
    store.activatePlugin("behaviour", uuid, [1, 0, 2]);
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          join(root, "worlds/Bedrock level/world_behaviour_packs.json"),
          "utf8",
        ),
      ),
      [{ pack_id: uuid, version: [1, 0, 2] }],
    );
    assert.equal(
      store.findDevelompentPlugins()[0].versions.filter((pack) => pack.active)
        .length,
      1,
    );
    store.deactivatePlugin("behaviour", uuid);
    assert.ok(
      store.findDevelompentPlugins()[0].versions.every((pack) => !pack.active),
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("pack state follows the configured world and absent lists represent no packs", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "worlds/Other World"));
    writeFileSync(join(root, "server.properties"), "level-name=Other World\n");
    const store = createPluginStore(root);
    assert.ok(
      store.findDevelompentPlugins()[0].versions.every((pack) => !pack.active),
    );
    store.activatePlugin("behaviour", uuid, [1, 0, 1]);
    assert.equal(
      JSON.parse(
        readFileSync(
          join(root, "worlds/Other World/world_behaviour_packs.json"),
          "utf8",
        ),
      )[0].pack_id,
      uuid,
    );
    assert.equal(
      readFileSync(
        join(root, "worlds/Bedrock level/world_behaviour_packs.json"),
        "utf8",
      ),
      "[]",
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("API routes work with and without /api and reject invalid pack inputs", async () => {
  const root = fixture();
  const calls: string[] = [];
  const control = {
    getStatus: () => ({ version: "1.0.0", status: "active" }),
    start: async () => {
      calls.push("start");
    },
    restart: async () => {
      calls.push("restart");
    },
    stop: async () => {
      calls.push("stop");
    },
  };
  const server = createApp({
    plugins: createPluginStore(root),
    control,
  }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (const prefix of ["", "/api"]) {
      assert.equal((await fetch(`${base}${prefix}/plugins`)).status, 200);
      assert.deepEqual(
        await (await fetch(`${base}${prefix}/mbs/status`)).json(),
        control.getStatus(),
      );
    }
    assert.equal(
      (
        await fetch(`${base}/api/plugins/activate/bad/${uuid}/1.0.1`, {
          method: "POST",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/api/plugins/${uuid}/bad/toggle`, {
          method: "POST",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/api/plugins/${uuid}/1.0.9/toggle`, {
          method: "POST",
        })
      ).status,
      404,
    );
    const toggle = () =>
      fetch(`${base}/api/plugins/${uuid}/1.0.1/toggle`, { method: "POST" });
    assert.deepEqual(await (await toggle()).json(), {
      success: true,
      active: true,
    });
    assert.deepEqual(await (await toggle()).json(), {
      success: true,
      active: false,
    });
    assert.equal(
      (await fetch(`${base}/api/mbs/start`, { method: "POST" })).status,
      200,
    );
    assert.equal(
      (await fetch(`${base}/api/mbs/stop`, { method: "POST" })).status,
      200,
    );
    assert.deepEqual(calls, ["restart", "stop"]);
    writeFileSync(
      join(root, "worlds/Bedrock level/world_behaviour_packs.json"),
      "invalid JSON",
    );
    const failed = await fetch(`${base}/api/plugins`);
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: "Internal server error" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(root, { recursive: true });
  }
});

test("plugin deployment preserves UUID and leaves activation untouched", async () => {
  const root = fixture();
  const project = sourceFixture();
  try {
    writeFileSync(join(root, "bedrock_server"), "");
    const oldMax = join(root, "development_behavior_packs/__Max");
    mkdirSync(oldMax);
    writeFileSync(
      join(oldMax, "manifest.json"),
      JSON.stringify({ header: { uuid } }),
    );
    writeFileSync(join(oldMax, "untouched.txt"), "old Max installation");
    await deployPlugins(root, project);
    const manifest = JSON.parse(
      readFileSync(
        join(root, "development_behavior_packs/example/manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.header.uuid, exampleUuid);
    assert.equal(manifest.modules[0].entry, "scripts/main.js");
    assert.equal(
      readFileSync(join(oldMax, "untouched.txt"), "utf8"),
      "old Max installation",
    );
    assert.equal(
      JSON.parse(readFileSync(join(oldMax, "manifest.json"), "utf8")).header
        .uuid,
      uuid,
    );
    assert.ok(
      readFileSync(
        join(root, "development_behavior_packs/example/scripts/main.js"),
        "utf8",
      ).includes("@minecraft/server"),
    );
    assert.ok(
      !existsSync(
        join(root, "development_behavior_packs/example/scripts/main.ts"),
      ),
    );
    assert.equal(
      readFileSync(
        join(root, "worlds/Bedrock level/world_behaviour_packs.json"),
        "utf8",
      ),
      "[]",
    );
    manifest.header.uuid = "00000000-0000-0000-0000-000000000000";
    writeFileSync(
      join(root, "development_behavior_packs/example/manifest.json"),
      JSON.stringify(manifest),
    );
    await assert.rejects(
      () => deployPlugins(root, project),
      /different pack UUID/,
    );
    assert.throws(
      () =>
        validateManifest({
          header: { uuid, version: [1, -1, 0] },
          modules: [],
        }),
      /integer version/,
    );
  } finally {
    rmSync(root, { recursive: true });
    rmSync(project.root, { recursive: true });
  }
});

test("plugin builds discover multiple packs, bundle every TypeScript entry, and copy resources", async () => {
  const project = sourceFixture();
  try {
    addSourcePack(project.sourceRoot, "second", "behavior", [
      "scripts/main.js",
      "scripts/nested/extra.js",
    ]);
    const resource = addSourcePack(project.sourceRoot, "second", "resource");
    addSourcePack(project.sourceRoot, "data-only", "behavior", []);
    writeFileSync(join(resource.source, "tsconfig.json"), "{}");
    writeFileSync(join(resource.source, "ignored.ts"), "export {};");
    const packs = await buildPlugins(project);
    assert.deepEqual(
      packs.map((pack) => `${pack.name}/${pack.kind}`),
      [
        "data-only/behavior",
        "example/behavior",
        "second/behavior",
        "second/resource",
      ],
    );
    for (const entry of ["scripts/main.js", "scripts/nested/extra.js"]) {
      const output = readFileSync(
        join(project.outputRoot, "second/behavior", entry),
        "utf8",
      );
      assert.ok(output.includes("@minecraft/server"));
      assert.ok(output.includes("Fixture compiled"));
      assert.ok(!output.includes(": string"));
      assert.ok(!output.includes("./label.js"));
      assert.ok(
        !existsSync(
          join(
            project.outputRoot,
            "second/behavior",
            entry.slice(0, -3) + ".ts",
          ),
        ),
      );
    }
    assert.ok(
      !existsSync(join(project.outputRoot, "second/behavior/scripts/label.ts")),
    );
    assert.equal(
      readFileSync(
        join(project.outputRoot, "second/resource/pack_icon.png"),
        "utf8",
      ),
      "fixture asset",
    );
    assert.ok(
      !existsSync(join(project.outputRoot, "second/resource/ignored.ts")),
    );
    assert.ok(
      !existsSync(join(project.outputRoot, "second/resource/tsconfig.json")),
    );
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          join(project.outputRoot, "second/resource/manifest.json"),
          "utf8",
        ),
      ),
      resource.manifest,
    );
  } finally {
    rmSync(project.root, { recursive: true });
  }
});

test("deployment replaces stale owned files and copies resource packs without changing worlds", async () => {
  const root = fixture();
  const project = sourceFixture();
  try {
    writeFileSync(join(root, "bedrock_server"), "");
    const resource = addSourcePack(project.sourceRoot, "example", "resource");
    await deployPlugins(root, project);
    const destination = join(root, "development_behavior_packs/example");
    const staleOutput = join(
      project.outputRoot,
      "example/behavior/scripts/removed.js",
    );
    const staleRuntime = join(destination, "scripts/removed.js");
    writeFileSync(staleOutput, "stale generated script");
    writeFileSync(staleRuntime, "stale deployed script");
    await deployPlugins(root, project);
    assert.ok(!existsSync(staleOutput));
    assert.ok(!existsSync(staleRuntime));
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          join(root, "development_resource_packs/example/manifest.json"),
          "utf8",
        ),
      ),
      resource.manifest,
    );
    assert.equal(
      readFileSync(
        join(root, "development_resource_packs/example/pack_icon.png"),
        "utf8",
      ),
      "fixture asset",
    );
    for (const kind of ["behaviour", "resource"]) {
      assert.equal(
        readFileSync(
          join(root, `worlds/Bedrock level/world_${kind}_packs.json`),
          "utf8",
        ),
        "[]",
      );
    }
  } finally {
    rmSync(root, { recursive: true });
    rmSync(project.root, { recursive: true });
  }
});

test("deployment preflights all destinations and rejects directories without manifests", async () => {
  const root = fixture();
  const project = sourceFixture();
  try {
    writeFileSync(join(root, "bedrock_server"), "");
    addSourcePack(project.sourceRoot, "second", "behavior");
    const collision = join(root, "development_behavior_packs/second");
    mkdirSync(collision);
    writeFileSync(
      join(collision, "manifest.json"),
      JSON.stringify({ header: { uuid } }),
    );
    await assert.rejects(
      () => deployPlugins(root, project),
      /different pack UUID/,
    );
    assert.ok(!existsSync(join(root, "development_behavior_packs/example")));
    assert.equal(
      JSON.parse(readFileSync(join(collision, "manifest.json"), "utf8")).header
        .uuid,
      uuid,
    );
    rmSync(join(collision, "manifest.json"));
    writeFileSync(join(collision, "untouched.txt"), "unowned folder");
    await assert.rejects(() => deployPlugins(root, project), /ENOENT/);
    assert.equal(
      readFileSync(join(collision, "untouched.txt"), "utf8"),
      "unowned folder",
    );
    assert.ok(!existsSync(join(root, "development_behavior_packs/example")));
  } finally {
    rmSync(root, { recursive: true });
    rmSync(project.root, { recursive: true });
  }
});

test("invalid entries, manifests, duplicate identities, and empty discovery fail explicitly", async () => {
  const project = sourceFixture();
  try {
    const pack = addSourcePack(project.sourceRoot, "invalid", "behavior");
    const manifestPath = join(pack.source, "manifest.json");
    const valid = structuredClone(pack.manifest);
    const script = pack.manifest.modules[0];
    assert.ok("entry" in script);
    for (const entry of [
      "scripts/../../escape.js",
      "/scripts/main.js",
      "scripts/main.ts",
      "scripts\\main.js",
    ]) {
      script.entry = entry;
      writeFileSync(manifestPath, JSON.stringify(pack.manifest));
      await assert.rejects(() => buildPlugins(project), /safe scripts/);
    }
    writeFileSync(manifestPath, JSON.stringify(valid));
    assert.throws(
      () =>
        validateManifest({
          ...valid,
          modules: [
            valid.modules[0],
            { ...valid.modules[0], uuid: randomUUID() },
          ],
        }),
      /Duplicate script entry/,
    );
    assert.throws(
      () =>
        validateManifest({
          ...valid,
          modules: [{ ...valid.modules[0], language: "typescript" }],
        }),
      /javascript language/,
    );
    assert.throws(
      () => validateManifest(valid, "resource"),
      /Unsupported resource module/,
    );
    rmSync(join(pack.source, "scripts/main.ts"));
    await assert.rejects(
      () => buildPlugins(project),
      /Missing TypeScript entry/,
    );
    writeFileSync(manifestPath, "{");
    await assert.rejects(() => buildPlugins(project), /Invalid source pack/);
    valid.header.uuid = exampleUuid;
    writeFileSync(manifestPath, JSON.stringify(valid));
    await assert.rejects(
      () => buildPlugins(project),
      /Duplicate pack\/module UUID/,
    );
    assert.ok(!existsSync(project.outputRoot));
    rmSync(join(project.sourceRoot, "invalid"), { recursive: true });
    rmSync(join(project.sourceRoot, "example"), { recursive: true });
    await assert.rejects(() => buildPlugins(project), /No source packs/);
    await assert.rejects(
      () => deployPlugins(project.root, project),
      /Not a Bedrock installation/,
    );
    assert.throws(() => validateManifest(null), /UUID/);
    assert.throws(
      () =>
        validateManifest({ header: { uuid, version: [1, 0, 0] }, modules: [] }),
      /declare modules/,
    );
  } finally {
    rmSync(project.root, { recursive: true });
  }
});

test("failed compilation leaves previously staged packs intact", async () => {
  const project = sourceFixture();
  try {
    await buildPlugins(project);
    const output = join(project.outputRoot, "example/behavior/scripts/main.js");
    writeFileSync(output, "previous successful output");
    const invalid = addSourcePack(project.sourceRoot, "second", "behavior");
    writeFileSync(join(invalid.source, "scripts/main.ts"), "const = invalid;");
    await assert.rejects(() => buildPlugins(project), /Build failed/);
    assert.equal(readFileSync(output, "utf8"), "previous successful output");
    assert.ok(!existsSync(join(project.outputRoot, "second")));
  } finally {
    rmSync(project.root, { recursive: true });
  }
});

test("shared plugin configuration rejects TypeScript errors without emitting files", () => {
  const root = mkdtempSync(join(tmpdir(), "mbs-plugin-types-"));
  try {
    const source = join(root, "main.ts");
    writeFileSync(source, "const message: string = 42;");
    const config = join(root, "tsconfig.json");
    writeFileSync(
      config,
      JSON.stringify({
        extends: resolve(import.meta.dirname, "../plugins/tsconfig.json"),
        include: ["main.ts"],
      }),
    );
    const typecheck = () =>
      spawnSync(
        process.execPath,
        [
          resolve(import.meta.dirname, "../node_modules/typescript/bin/tsc"),
          "-p",
          config,
        ],
        { encoding: "utf8" },
      );
    const failed = typecheck();
    assert.equal(failed.status, 2, failed.stderr);
    assert.match(
      failed.stdout,
      /Type 'number' is not assignable to type 'string'/,
    );
    assert.ok(!existsSync(join(root, "main.js")));
    writeFileSync(source, 'const message: string = "Valid";');
    const passed = typecheck();
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
    assert.ok(!existsSync(join(root, "main.js")));
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("example startup and ping produce visible messages without custom commands", async () => {
  const project = sourceFixture();
  try {
    const [pack] = await buildPlugins(project);
    const stub = join(project.root, "minecraft.mjs");
    writeFileSync(
      stub,
      `
      export const messages = [];
      export const callbacks = {};
      export const world = {
        afterEvents: { worldLoad: { subscribe(callback) { callbacks.load = callback; } } },
        sendMessage(message) { messages.push(message); }
      };
      export const system = {
        afterEvents: { scriptEventReceive: { subscribe(callback) { callbacks.event = callback; } } }
      };
    `,
    );
    const harness = join(project.root, "harness.mjs");
    await build({
      stdin: {
        contents: `import ${JSON.stringify(join(pack.output, "scripts/main.js"))}; export { messages, callbacks } from ${JSON.stringify(stub)};`,
        resolveDir: project.root,
      },
      alias: { "@minecraft/server": stub },
      outfile: harness,
      bundle: true,
      platform: "node",
      format: "esm",
    });
    const { messages, callbacks } = await import(pathToFileURL(harness).href);
    assert.deepEqual(messages, []);
    callbacks.load();
    assert.deepEqual(messages, [
      "[TypeScript example] Loaded. Run /scriptevent example:ping",
    ]);
    callbacks.event({ id: "other:ping", message: "" });
    assert.equal(messages.length, 1);
    callbacks.event({ id: "example:ping", message: "" });
    assert.deepEqual(messages, [
      "[TypeScript example] Loaded. Run /scriptevent example:ping",
      "[TypeScript example] Pong! TypeScript is running.",
    ]);
  } finally {
    rmSync(project.root, { recursive: true });
  }
});
