import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPluginStore } from "../App/server/data/Plugins.ts";
import { createApp } from "../App/server/app.ts";
import { deployPlugin, validateManifest } from "../scripts/plugins.ts";
import { once } from "node:events";

const uuid = "597d3dd8-5075-4785-96ef-36ed2359a2b9";

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
  try {
    writeFileSync(join(root, "bedrock_server"), "");
    await deployPlugin(root);
    const manifest = JSON.parse(
      readFileSync(
        join(root, "development_behavior_packs/__Max/manifest.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.header.uuid, uuid);
    assert.ok(
      readFileSync(
        join(root, "development_behavior_packs/__Max/scripts/main.js"),
        "utf8",
      ).includes("@minecraft/server"),
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
      join(root, "development_behavior_packs/__Max/manifest.json"),
      JSON.stringify(manifest),
    );
    await assert.rejects(() => deployPlugin(root), /different pack UUID/);
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
  }
});
