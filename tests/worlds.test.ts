import assert from "node:assert/strict";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../App/server/app.ts";
import { createPluginStore } from "../App/server/data/Plugins.ts";
import { createWorldStore } from "../App/server/data/Worlds.ts";
import {
  atomicWrite,
  updateProperties,
  validateWorldName,
  WorldError,
} from "../App/server/data/WorldProperties.ts";

const initialProperties = [
  "# Keep comments and unrelated settings",
  "level-name=Original",
  "level-seed=-1586321397794620064",
  "gamemode=survival",
  "difficulty=easy",
  "force-gamemode=false",
  "transport=nethernet",
  "",
].join("\r\n");
const uuid = "597d3dd8-5075-4785-96ef-36ed2359a2b9";

function fixture(running = true) {
  const root = mkdtempSync(join(tmpdir(), "mbs-world-test-"));
  const propertiesFile = join(root, "server.properties");
  writeFileSync(propertiesFile, initialProperties);
  for (const name of ["Original", "Other"]) {
    const path = join(root, "worlds", name);
    mkdirSync(join(path, "db"), { recursive: true });
    writeFileSync(join(path, "db", "CURRENT"), "MANIFEST-000001\n");
  }
  mkdirSync(join(root, "development_behavior_packs", "test"), {
    recursive: true,
  });
  mkdirSync(join(root, "development_resource_packs"));
  writeFileSync(
    join(root, "development_behavior_packs", "test", "manifest.json"),
    JSON.stringify({
      header: { uuid, name: "Test", version: [1, 0, 1], description: "Pack" },
    }),
  );
  const calls: { action: string; properties: string }[] = [];
  const state = { running, failStop: false, failStart: 0 };
  const control = {
    getStatus: () => ({
      version: "1.0.0",
      status: state.running ? "active" : "stopped",
    }),
    stop: async () => {
      calls.push({
        action: "stop",
        properties: readFileSync(propertiesFile, "utf8"),
      });
      if (state.failStop) throw new Error("stop failure");
      state.running = false;
    },
    start: async () => {
      calls.push({
        action: "start",
        properties: readFileSync(propertiesFile, "utf8"),
      });
      if (state.failStart-- > 0) throw new Error("start failure");
      state.running = true;
    },
    restart: async () => {
      await control.stop();
      await control.start();
    },
  };
  const store = createWorldStore(root, control);
  return {
    root,
    propertiesFile,
    calls,
    state,
    control,
    store,
    cleanup: () => rmSync(root, { recursive: true }),
  };
}

const newWorld = {
  name: "New World",
  seed: "",
  gameMode: "creative",
  difficulty: "hard",
  activate: false,
};

test("world discovery identifies generated worlds and configured defaults", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, "worlds", "unmanaged-empty"));
    symlinkSync(
      join(f.root, "worlds", "Original"),
      join(f.root, "worlds", "link"),
    );
    const result = f.store.list();
    assert.equal(result.activeWorld, "Original");
    assert.deepEqual(result.defaults, {
      seed: "-1586321397794620064",
      gameMode: "survival",
      difficulty: "easy",
    });
    assert.deepEqual(
      result.worlds.map((world) => world.name),
      ["Original", "Other"],
    );
    assert.ok(
      result.worlds.every((world) => world.generated && !world.settings),
    );
  } finally {
    f.cleanup();
  }
});

test("creation reserves a pending world without changing properties or pack lists", async () => {
  const f = fixture();
  try {
    const result = await f.store.create(newWorld);
    const created = result.worlds.find((world) => world.name === newWorld.name);
    assert.deepEqual(created, {
      name: newWorld.name,
      active: false,
      generated: false,
      settings: { seed: "", gameMode: "creative", difficulty: "hard" },
    });
    assert.equal(readFileSync(f.propertiesFile, "utf8"), initialProperties);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(readdirSync(join(f.root, "worlds", newWorld.name)), [
      ".mbs-world.json",
    ]);
    await assert.rejects(() => f.store.create(newWorld), { status: 409 });
    assert.deepEqual(result, f.store.list());
  } finally {
    f.cleanup();
  }
});

test("running switch waits for stop, applies settings, starts, and restores outgoing settings on return", async () => {
  const f = fixture();
  try {
    await f.store.create(newWorld);
    const result = await f.store.activate(newWorld.name);
    assert.deepEqual(
      f.calls.map((call) => call.action),
      ["stop", "start"],
    );
    assert.equal(f.calls[0].properties, initialProperties);
    assert.match(
      f.calls[1].properties,
      /level-name=New World\r\nlevel-seed=\r\n/,
    );
    assert.match(f.calls[1].properties, /gamemode=creative\r\ndifficulty=hard/);
    assert.match(
      f.calls[1].properties,
      /force-gamemode=false\r\ntransport=nethernet/,
    );
    assert.ok(f.calls[1].properties.startsWith("# Keep comments"));
    assert.equal(result.activeWorld, newWorld.name);
    assert.equal(result.worlds.find((world) => world.active)?.generated, false);
    await f.store.activate("Original");
    assert.equal(readFileSync(f.propertiesFile, "utf8"), initialProperties);
    assert.equal(f.state.running, true);
  } finally {
    f.cleanup();
  }
});

test("stopped create-and-activate leaves stopped; large seeds are strings and generation is observed from data", async () => {
  const f = fixture(false);
  try {
    await f.store.create({
      ...newWorld,
      activate: true,
      seed: "-9223372036854775808",
    });
    assert.deepEqual(f.calls, []);
    assert.equal(f.state.running, false);
    assert.match(
      readFileSync(f.propertiesFile, "utf8"),
      /level-seed=-9223372036854775808/,
    );
    assert.equal(
      f.store.list().worlds.find((world) => world.active)?.generated,
      false,
    );
    const db = join(f.root, "worlds", newWorld.name, "db");
    mkdirSync(db);
    assert.equal(
      f.store.list().worlds.find((world) => world.active)?.generated,
      false,
    );
    writeFileSync(join(db, "CURRENT"), "MANIFEST-000001\n");
    assert.equal(
      f.store.list().worlds.find((world) => world.active)?.generated,
      true,
    );
  } finally {
    f.cleanup();
  }
});

test("active selection is a no-op and unmanaged existing worlds retain server defaults", async () => {
  const f = fixture();
  try {
    await f.store.activate("Original");
    assert.deepEqual(f.calls, []);
    await f.store.activate("Other");
    assert.equal(
      readFileSync(f.propertiesFile, "utf8"),
      initialProperties.replace("level-name=Original", "level-name=Other"),
    );
  } finally {
    f.cleanup();
  }
});

test("invalid names, property injection, settings, duplicates and symlinks are rejected before lifecycle changes", async () => {
  const f = fixture();
  try {
    for (const name of [
      "",
      ".",
      "..",
      "../escape",
      "a/b",
      "a\\b",
      "a\nlevel-name=bad",
      "bad;",
      "bad:",
      "bad*",
      "bad?",
      'bad"',
      "bad<",
      "bad>",
      "bad|",
      "bad`",
      " bad",
      "bad ",
      "bad.",
      "a".repeat(201),
      "\x00bad",
    ]) {
      assert.throws(() => validateWorldName(name), WorldError);
      await assert.rejects(() => f.store.create({ ...newWorld, name }), {
        status: 400,
      });
    }
    for (const fields of [
      { seed: 123 },
      { seed: "seed\nlevel-name=bad" },
      { gameMode: "hardcore" },
      { difficulty: "extreme" },
      { activate: "yes" },
    ]) {
      await assert.rejects(() => f.store.create({ ...newWorld, ...fields }), {
        status: 400,
      });
    }
    await assert.rejects(() => f.store.activate("Missing"), { status: 404 });
    mkdirSync(join(f.root, "worlds", "Empty"));
    await assert.rejects(() => f.store.activate("Empty"), { status: 400 });
    symlinkSync(
      join(f.root, "worlds", "Original"),
      join(f.root, "worlds", "Link"),
    );
    await assert.rejects(() => f.store.activate("Link"), { status: 400 });
    await assert.rejects(() => f.store.create({ ...newWorld, name: "Link" }), {
      status: 409,
    });
    symlinkSync(
      f.propertiesFile,
      join(f.root, "worlds", "Other", ".mbs-world.json"),
    );
    await assert.rejects(() => f.store.activate("Other"), { status: 500 });
    assert.equal(readFileSync(f.propertiesFile, "utf8"), initialProperties);
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test("property replacement is literal, rejects duplicates, and atomic writes preserve the original on failure", () => {
  const f = fixture();
  try {
    const text = updateProperties(initialProperties, "$& World", {
      seed: "$&",
      gameMode: "adventure",
      difficulty: "peaceful",
    });
    assert.match(text, /level-name=\$& World\r\nlevel-seed=\$&/);
    assert.throws(
      () =>
        updateProperties(
          initialProperties + "level-name=Duplicate\r\n",
          "Other",
          {
            seed: "",
            gameMode: "survival",
            difficulty: "easy",
          },
        ),
      /exactly one level-name/,
    );
    const directory = join(f.root, "not-a-file");
    mkdirSync(directory);
    assert.throws(() => atomicWrite(directory, "no"), /regular file/);
    assert.deepEqual(readdirSync(directory), []);
    assert.equal(readFileSync(f.propertiesFile, "utf8"), initialProperties);
  } finally {
    f.cleanup();
  }
});

test("stop failure leaves configuration untouched; startup failure restores previous configuration and running state", async () => {
  const f = fixture();
  try {
    f.state.failStop = true;
    await assert.rejects(
      () => f.store.activate("Other"),
      /Unable to stop.*not changed/,
    );
    assert.equal(readFileSync(f.propertiesFile, "utf8"), initialProperties);
    assert.deepEqual(
      f.calls.map((call) => call.action),
      ["stop"],
    );
    f.calls.length = 0;
    f.state.failStop = false;
    f.state.failStart = 1;
    await assert.rejects(
      () => f.store.activate("Other"),
      /Previous configuration was restored/,
    );
    assert.deepEqual(
      f.calls.map((call) => call.action),
      ["stop", "start", "stop", "start"],
    );
    assert.match(f.calls[1].properties, /level-name=Other/);
    assert.equal(f.calls[3].properties, initialProperties);
    assert.equal(f.state.running, true);
    assert.equal(f.store.list().activeWorld, "Original");
  } finally {
    f.cleanup();
  }
});

test("configuration-write and recovery failures are explicit; created worlds are retained on activation failure", async () => {
  const f = fixture();
  try {
    const stop = f.control.stop;
    f.control.stop = async () => {
      await stop();
      mkdirSync(join(f.root, "worlds", "Original", ".mbs-world.json"));
    };
    await assert.rejects(
      () => f.store.activate("Other"),
      /save world configuration/,
    );
    assert.equal(readFileSync(f.propertiesFile, "utf8"), initialProperties);
    assert.equal(f.state.running, true);
    rmSync(join(f.root, "worlds", "Original", ".mbs-world.json"), {
      recursive: true,
    });
    f.control.stop = stop;
    f.state.failStart = 2;
    await assert.rejects(
      () => f.store.create({ ...newWorld, activate: true }),
      /created and retained.*Recovery failed/,
    );
    assert.equal(readFileSync(f.propertiesFile, "utf8"), initialProperties);
    assert.equal(f.state.running, false);
    assert.ok(
      existsSync(join(f.root, "worlds", newWorld.name, ".mbs-world.json")),
    );
  } finally {
    f.cleanup();
  }
});

test("external configuration changes during shutdown are not overwritten or automatically started", async () => {
  const f = fixture();
  try {
    const stop = f.control.stop;
    const external = initialProperties.replace(
      "difficulty=easy",
      "difficulty=hard",
    );
    f.control.stop = async () => {
      await stop();
      writeFileSync(f.propertiesFile, external);
    };
    await assert.rejects(
      () => f.store.activate("Other"),
      /Configuration changed externally; the server was left stopped/,
    );
    assert.equal(readFileSync(f.propertiesFile, "utf8"), external);
    assert.equal(f.state.running, false);
    assert.deepEqual(
      f.calls.map((call) => call.action),
      ["stop"],
    );
  } finally {
    f.cleanup();
  }
});

test("failed recovery shutdown does not falsely report that configuration was unchanged", async () => {
  const f = fixture();
  try {
    f.control.start = async () => {
      f.state.failStop = true;
      throw new Error("startup failed and shutdown will fail");
    };
    await assert.rejects(
      () => f.store.activate("Other"),
      /selected world may still be configured.*Recovery failed/,
    );
    assert.match(readFileSync(f.propertiesFile, "utf8"), /level-name=Other/);
    assert.equal(f.store.list().activeWorld, "Other");
  } finally {
    f.cleanup();
  }
});

test("unsupported outgoing metadata is rejected before shutdown instead of overwritten", async () => {
  const f = fixture();
  try {
    const file = join(f.root, "worlds", "Original", ".mbs-world.json");
    const data = '{"version":2,"settings":{}}';
    writeFileSync(file, data);
    await assert.rejects(
      () => f.store.activate("Other"),
      /Unsupported world metadata/,
    );
    assert.deepEqual(f.calls, []);
    assert.equal(readFileSync(file, "utf8"), data);
  } finally {
    f.cleanup();
  }
});

test("plugin stores follow world switches without API restart while explicit fixed-world stores remain fixed", async () => {
  const f = fixture(false);
  try {
    const plugins = createPluginStore(f.root);
    const fixed = createPluginStore(f.root, "Original");
    plugins.activatePlugin("behaviour", uuid, [1, 0, 1]);
    await f.store.activate("Other");
    assert.equal(plugins.findDevelompentPlugins()[0].versions[0].active, false);
    assert.equal(fixed.findDevelompentPlugins()[0].versions[0].active, true);
    plugins.activatePlugin("behaviour", uuid, [1, 0, 1]);
    await f.store.activate("Original");
    assert.equal(plugins.findDevelompentPlugins()[0].versions[0].active, true);
    for (const name of ["Original", "Other"]) {
      assert.deepEqual(
        JSON.parse(
          readFileSync(
            join(f.root, "worlds", name, "world_behaviour_packs.json"),
            "utf8",
          ),
        ),
        [{ pack_id: uuid, version: [1, 0, 1] }],
      );
    }
  } finally {
    f.cleanup();
  }
});

test("world APIs support both prefixes, return actionable errors, and coordinate lifecycle and pack mutations", async () => {
  const f = fixture();
  let releaseStop: (() => void) | undefined;
  let signalStop: (() => void) | undefined;
  const enteredStop = new Promise<void>((resolve) => {
    signalStop = resolve;
  });
  const actualStop = f.control.stop;
  f.control.stop = async () => {
    signalStop?.();
    await new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    await actualStop();
  };
  const app = createApp({
    plugins: createPluginStore(f.root),
    worlds: f.store,
    control: f.control,
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: unknown = {}) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    for (const prefix of ["", "/api"]) {
      assert.equal((await fetch(`${base}${prefix}/worlds`)).status, 200);
      assert.equal(
        (await post(`${prefix}/worlds/activate`, { name: "../bad" })).status,
        400,
      );
    }
    const created = await post("/api/worlds", newWorld);
    assert.equal(created.status, 201);
    assert.equal(
      ((await created.json()) as { activeWorld: string }).activeWorld,
      "Original",
    );
    const switching = post("/worlds/activate", { name: newWorld.name });
    await enteredStop;
    for (const path of [
      "/api/mbs/start",
      "/mbs/stop",
      "/api/worlds",
      `/api/plugins/${uuid}/1.0.1/toggle`,
      `/plugins/activate/behaviour/${uuid}/1.0.1`,
    ]) {
      const response = await post(path, newWorld);
      assert.equal(response.status, 409);
      assert.match(
        ((await response.json()) as { error: string }).error,
        /in progress/,
      );
    }
    releaseStop?.();
    assert.equal((await switching).status, 200);
    assert.equal((await post(`/api/plugins/${uuid}/1.0.1/toggle`)).status, 200);
    assert.ok(
      existsSync(
        join(f.root, "worlds", newWorld.name, "world_behaviour_packs.json"),
      ),
    );
    const missing = await post("/api/worlds/activate", { name: "Missing" });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "World not found." });
  } finally {
    releaseStop?.();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    f.cleanup();
  }
});
