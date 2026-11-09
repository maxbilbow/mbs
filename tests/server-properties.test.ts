import assert from "node:assert/strict";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  createPropertyStore,
  mergeProperties,
  parseProperties,
  TEMPLATE_FILE,
} from "../App/server/data/ServerProperties.ts";
import type { WorldProperties } from "../App/model/Worlds.ts";
import {
  PROPERTY_CATEGORIES,
  propertyCategory,
} from "../App/client/components/worldPropertyCategories.ts";

const initial = [
  "# Original configuration",
  "level-name=Original",
  "level-seed=9223372036854775807",
  "gamemode=survival",
  "difficulty=easy",
  "server-name=Custom server",
  "transport=nethernet",
  "allow-cheats=true",
  "",
].join("\r\n");
const vendor = [
  "# Vendor defaults - keep byte for byte",
  "level-name=Bedrock level",
  "level-seed=",
  "gamemode=survival",
  "difficulty=normal",
  "server-name=Dedicated Server",
  "transport=raknet",
  "allow-cheats=false",
  "new-setting=vendor default",
  "#server-ip=",
  "#script-watchdog-enable=true",
  "",
].join("\r\n");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mbs-properties-test-"));
  writeFileSync(join(root, "server.properties"), initial);
  for (const name of ["Original", "Other"]) {
    mkdirSync(join(root, "worlds", name, "db"), { recursive: true });
    writeFileSync(join(root, "worlds", name, "db", "CURRENT"), "manifest");
  }
  mkdirSync(join(root, "development_behavior_packs"));
  mkdirSync(join(root, "development_resource_packs"));
  const calls: string[] = [];
  const control = {
    getStatus: () => ({ status: "stopped", version: "1.0.0" }),
    stop: async () => {
      calls.push("stop");
    },
    start: async () => {
      calls.push("start");
    },
    restart: async () => {
      calls.push("restart");
    },
  };
  const store = createWorldStore(root, control);
  const properties = createPropertyStore(root);
  const runtime = () => readFileSync(join(root, "server.properties"), "utf8");
  const profile = (name: string) =>
    readFileSync(join(root, "worlds", name, "server.properties"), "utf8");
  const save = (name: string, overrides: Record<string, string>) =>
    store.saveProperties(name, {
      overrides,
      revision: store.getProperties(name).revision,
    });
  return {
    root,
    store,
    properties,
    runtime,
    profile,
    save,
    calls,
    control,
    cleanup: () => rmSync(root, { recursive: true }),
  };
}

test("updates retain the exact vendor template and migrate all legacy customisations", () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.root, "worlds", "Other", ".mbs-world.json"),
      JSON.stringify({
        version: 1,
        settings: {
          seed: "different",
          gameMode: "creative",
          difficulty: "hard",
        },
      }),
    );
    mkdirSync(join(f.root, "worlds", "unmanaged-empty"));
    const archiveBytes = Buffer.concat([
      Buffer.from("# "),
      Buffer.from([0xff]),
      Buffer.from("\r\n" + vendor),
    ]);
    f.properties.installTemplate(archiveBytes);
    assert.deepEqual(readFileSync(join(f.root, TEMPLATE_FILE)), archiveBytes);
    assert.equal(parseProperties(f.runtime())["server-name"], "Custom server");
    assert.equal(parseProperties(f.runtime())["new-setting"], "vendor default");
    assert.equal(parseProperties(f.profile("Other")).gamemode, "creative");
    assert.equal(parseProperties(f.profile("Other")).transport, "nethernet");
    assert.equal(
      parseProperties(f.profile("Original"))["level-name"],
      undefined,
    );
    assert.equal(
      existsSync(
        join(f.root, "worlds", "unmanaged-empty", "server.properties"),
      ),
      false,
    );
    assert.equal(f.store.list().worlds.length, 2);
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test("new worlds inherit new defaults while legacy overrides stay pinned across updates", async () => {
  const f = fixture();
  try {
    await f.store.create({
      name: "Fresh",
      seed: "",
      gameMode: "creative",
      difficulty: "hard",
      activate: false,
    });
    assert.equal(
      f.profile("Fresh"),
      "level-seed=\ngamemode=creative\ndifficulty=hard\n",
    );
    f.properties.installTemplate(vendor);
    await f.store.activate("Fresh");
    assert.equal(
      parseProperties(f.runtime())["server-name"],
      "Dedicated Server",
    );
    assert.equal(parseProperties(f.runtime())["level-name"], "Fresh");
    assert.equal(parseProperties(f.runtime()).gamemode, "creative");
    f.properties.installTemplate(
      vendor.replace("transport=raknet", "transport=nethernet"),
    );
    assert.equal(parseProperties(f.runtime()).transport, "nethernet");
    await f.store.activate("Original");
    assert.equal(parseProperties(f.runtime())["server-name"], "Custom server");
  } finally {
    f.cleanup();
  }
});

test("per-world edits and resets rebuild only the active configuration without lifecycle calls", async () => {
  const f = fixture();
  try {
    f.properties.installTemplate(vendor);
    const before = f.runtime();
    const other = f.store.getProperties("Other");
    f.save("Other", { ...other.overrides, "server-name": "$& Other" });
    assert.equal(f.runtime(), before);
    await f.store.activate("Other");
    assert.equal(parseProperties(f.runtime())["server-name"], "$& Other");
    const selected = f.store.getProperties("Other");
    delete selected.overrides["server-name"];
    f.save("Other", selected.overrides);
    assert.equal(
      parseProperties(f.runtime())["server-name"],
      "Dedicated Server",
    );
    assert.equal(parseProperties(f.profile("Other"))["server-name"], undefined);
    f.save("Other", {});
    assert.equal(f.profile("Other"), "");
    assert.equal(parseProperties(f.runtime()).difficulty, "normal");
    assert.equal(parseProperties(f.runtime())["level-name"], "Other");
    await f.store.activate("Original");
    assert.equal(parseProperties(f.runtime())["server-name"], "Custom server");
    assert.equal(readFileSync(join(f.root, TEMPLATE_FILE), "utf8"), vendor);
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test("manual world-file edits are authoritative and do not get replaced by generated runtime values", async () => {
  const f = fixture();
  try {
    f.properties.installTemplate(vendor);
    writeFileSync(
      join(f.root, "worlds", "Original", "server.properties"),
      "server-name=Edited in file\n",
    );
    await f.store.activate("Other");
    await f.store.activate("Original");
    assert.equal(parseProperties(f.runtime())["server-name"], "Edited in file");
  } finally {
    f.cleanup();
  }
});

test("property revisions reject stale profile and template edits", () => {
  const f = fixture();
  try {
    f.properties.installTemplate(vendor);
    const old = f.store.getProperties("Original");
    f.save("Original", { ...old.overrides, "server-name": "Newer" });
    assert.throws(() => f.store.saveProperties("Original", old), {
      status: 409,
    });
    const beforeUpdate = f.store.getProperties("Original");
    f.properties.installTemplate(vendor + "# new release\n");
    assert.throws(() => f.store.saveProperties("Original", beforeUpdate), {
      status: 409,
    });
    assert.equal(parseProperties(f.runtime())["server-name"], "Newer");
    const beforeExternalEdit = f.store.getProperties("Original");
    writeFileSync(
      join(f.root, "server.properties"),
      f.runtime() + "# External edit\n",
    );
    assert.throws(
      () => f.store.saveProperties("Original", beforeExternalEdit),
      { status: 409 },
    );
  } finally {
    f.cleanup();
  }
});

test("optional properties are editable and invalid input never changes files", () => {
  const f = fixture();
  try {
    f.properties.installTemplate(vendor);
    const data = f.store.getProperties("Original");
    assert.equal(data.defaults["server-ip"], "");
    assert.equal(data.defaults["script-watchdog-enable"], "true");
    f.save("Original", { ...data.overrides, "server-ip": "127.0.0.1" });
    assert.equal(parseProperties(f.runtime())["server-ip"], "127.0.0.1");
    const before = f.runtime();
    const profile = f.profile("Original");
    for (const overrides of [
      { "level-name": "Other" },
      { "unknown-property": "yes" },
      { "server-name": "injected\ndifficulty=hard" },
      { "server-name": "bad\rdata" },
      { "allow-cheats": "yes" },
      { difficulty: "impossible" },
      { "server-name": 42 },
      [],
    ]) {
      assert.throws(
        () =>
          f.store.saveProperties("Original", {
            revision: f.store.getProperties("Original").revision,
            overrides,
          }),
        { status: 400 },
      );
      assert.equal(f.runtime(), before);
      assert.equal(f.profile("Original"), profile);
    }
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test("malformed templates and symlink profiles are rejected without changing live configuration", () => {
  const f = fixture();
  try {
    for (const text of [
      vendor + "difficulty=hard\n",
      vendor.replace("gamemode=survival", "gamemode=bad"),
    ]) {
      assert.throws(() => f.properties.installTemplate(text));
      assert.equal(f.runtime(), initial);
      assert.equal(existsSync(join(f.root, TEMPLATE_FILE)), false);
    }
    symlinkSync(
      join(f.root, "server.properties"),
      join(f.root, "worlds", "Other", "server.properties"),
    );
    assert.throws(() => f.properties.installTemplate(vendor), /regular file/);
    assert.equal(f.runtime(), initial);
    assert.equal(existsSync(join(f.root, TEMPLATE_FILE)), false);
  } finally {
    f.cleanup();
  }
});

test("merges preserve template comments, line endings and literal values", () => {
  assert.equal(
    mergeProperties("# comment\r\none=value\r\n", { one: "$&", two: "" }),
    "# comment\r\none=$&\r\ntwo=\r\n",
  );
  assert.equal(
    mergeProperties("# comment\none=value", { one: "new", two: "other" }),
    "# comment\none=new\ntwo=other\n",
  );
});

test("property API supports both route prefixes and rejects stale saves", async () => {
  const f = fixture();
  const server = createApp({
    worlds: f.store,
    control: f.control,
    plugins: createPluginStore(f.root),
  }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (const prefix of ["", "/api"]) {
      const response = await fetch(
        `${base}${prefix}/worlds/properties?name=Other`,
      );
      assert.equal(response.status, 200);
      const data = (await response.json()) as WorldProperties;
      const save = () =>
        fetch(`${base}${prefix}/worlds/properties`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            overrides: { "server-name": `${prefix} edited` },
          }),
        });
      assert.equal((await save()).status, 200);
      assert.equal((await save()).status, 409);
      assert.equal(f.runtime(), initial);
      assert.equal(
        (await fetch(`${base}${prefix}/worlds/properties?name=Missing`)).status,
        404,
      );
    }
    assert.deepEqual(f.calls, []);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    f.cleanup();
  }
});

test("categories cover representative properties and keep new properties navigable", () => {
  for (const [key, category] of [
    ["gamemode", "World and gameplay"],
    ["allow-list", "Players and access"],
    ["server-ip", "Networking"],
    ["persistent-ticking-area-max-count", "Performance"],
    ["allow-inbound-script-debugging", "Packs and scripting"],
    ["script-watchdog-enable", "Packs and scripting"],
    ["diagnostics-capture-auto-start", "Diagnostics"],
    ["future-property", "Other"],
  ] as const) {
    assert.equal(propertyCategory(key), category);
    assert.ok(PROPERTY_CATEGORIES.includes(propertyCategory(key)));
  }
});
