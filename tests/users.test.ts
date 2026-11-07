import assert from "node:assert/strict";
import { once } from "node:events";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../App/server/app.ts";
import { createPluginStore } from "../App/server/data/Plugins.ts";
import { createUserStore } from "../App/server/data/Users.ts";
import { createWorldStore } from "../App/server/data/Worlds.ts";
import { isUpdateFile } from "../scripts/update-server.ts";

const first = "9007199254740993";
const second = "9007199254740994";
const original =
  JSON.stringify([{ xuid: first, permission: "operator" }], null, 2) + "\n";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mbs-users-test-"));
  const runtime = join(root, "bedrock");
  const log = join(root, "logs", "bedrock.log");
  mkdirSync(join(root, "logs"));
  mkdirSync(runtime);
  for (const world of ["Original", "Other"]) {
    mkdirSync(join(runtime, "worlds", world, "db"), { recursive: true });
    writeFileSync(
      join(runtime, "worlds", world, "db", "CURRENT"),
      "manifest\n",
    );
  }
  mkdirSync(join(runtime, "development_behavior_packs"));
  mkdirSync(join(runtime, "development_resource_packs"));
  writeFileSync(
    join(runtime, "server.properties"),
    [
      "level-name=Original",
      "level-seed=",
      "gamemode=survival",
      "difficulty=easy",
      "default-player-permission-level=member",
      "",
    ].join("\n"),
  );
  writeFileSync(join(runtime, "permissions.json"), original);
  const calls: string[] = [];
  const state = { running: true, failStart: false, failStop: false };
  const control = {
    getStatus: () => ({
      status: state.running ? "active" : "stopped",
      version: "1",
    }),
    stop: async () => {
      calls.push("stop");
      if (state.failStop) throw new Error("stop failure");
      state.running = false;
    },
    start: async () => {
      calls.push("start");
      if (state.failStart) {
        state.failStart = false;
        throw new Error("start failure");
      }
      state.running = true;
    },
    restart: async () => {
      await control.stop();
      await control.start();
    },
  };
  const worlds = createWorldStore(runtime, control);
  const users = worlds.users;
  const names = ["Original", "Other"];
  return {
    root,
    runtime,
    log,
    control,
    state,
    calls,
    worlds,
    users,
    names,
    cleanup: () => rmSync(root, { recursive: true }),
    permissions: () => readFileSync(join(runtime, "permissions.json"), "utf8"),
  };
}

test("discovery imports current-world permissions only, deduplicates XUIDs, and preserves aliases", () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.runtime, "allowlist.json"),
      JSON.stringify([
        { xuid: first, name: "OldName", ignoresPlayerLimit: false },
        { xuid: second, name: "AllowedPlayer" },
        { name: "NoXuidYet", xuid: "" },
      ]),
    );
    writeFileSync(f.log, `[INFO] Player connected: NewName, xuid: ${first}\n`);
    const result = f.users.list(f.names);
    assert.equal(result.defaultPermission, "member");
    assert.equal(result.users.length, 2);
    assert.deepEqual(result.users[0], {
      xuid: first,
      username: "NewName",
      alias: "",
      permissions: { Original: "operator" },
    });
    assert.equal(result.users[1].username, "AllowedPlayer");
    f.users.update(
      {
        xuid: first,
        alias: "Builder",
        world: "Original",
        permission: "operator",
      },
      f.names,
    );
    appendFileSync(
      f.log,
      `[INFO] Player Spawned: Renamed xuid: ${first}, pfid: ignored\n`,
    );
    const renamed = f.users.list(f.names).users[0];
    assert.equal(renamed.username, "Renamed");
    assert.equal(renamed.alias, "Builder");
    assert.equal(f.users.list(f.names).users[0].username, "Renamed");
    const reloaded = createUserStore(f.runtime).list(f.names);
    assert.equal(reloaded.users[0].alias, "Builder");
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test("new XUIDs in appended logs, split lines, truncation, rotation, and external permissions are discovered", () => {
  const f = fixture();
  try {
    f.users.list(f.names);
    writeFileSync(f.log, `[INFO] Player connected: Player, xuid: ${second}`);
    assert.equal(f.users.list(f.names).users.length, 1);
    appendFileSync(f.log, "\n");
    assert.equal(f.users.list(f.names).users[1].username, "Player");
    writeFileSync(f.log, `[INFO] Player connected: X, xuid: ${second}\n`);
    assert.equal(f.users.list(f.names).users[1].username, "X");
    renameSync(f.log, join(f.root, "logs", "old.log"));
    writeFileSync(
      f.log,
      `[INFO] Player disconnected: Rotated, xuid: ${second}, pfid: ignored\n`,
    );
    assert.equal(f.users.list(f.names).users[1].username, "Rotated");
    writeFileSync(
      join(f.runtime, "permissions.json"),
      JSON.stringify([{ xuid: "9223372036854775808", permission: "visitor" }]),
    );
    const users = f.users.list(f.names).users;
    assert.ok(
      users.some(
        (user) =>
          user.xuid === "9223372036854775808" &&
          user.permissions.Original === "visitor",
      ),
    );
    assert.equal(users.length, 3);
  } finally {
    f.cleanup();
  }
});

test("inactive assignments are isolated; active saves do not restart; removing overrides inherits defaults", async () => {
  const f = fixture();
  try {
    f.users.update(
      { xuid: first, alias: "Alias", world: "Other", permission: "visitor" },
      f.names,
    );
    assert.equal(f.permissions(), original);
    assert.deepEqual(f.calls, []);
    await f.worlds.activate("Other");
    assert.deepEqual(JSON.parse(f.permissions()), [
      { xuid: first, permission: "visitor" },
    ]);
    const other = f.users.list(f.names);
    assert.equal(other.activeWorld, "Other");
    assert.deepEqual(other.users[0].permissions, {
      Original: "operator",
      Other: "visitor",
    });
    f.calls.length = 0;
    f.users.update(
      { xuid: first, alias: "", world: "Other", permission: null },
      f.names,
    );
    assert.deepEqual(JSON.parse(f.permissions()), []);
    assert.deepEqual(f.calls, []);
    await f.worlds.activate("Original");
    assert.equal(f.permissions(), original);
    await f.worlds.activate("Other");
    assert.deepEqual(JSON.parse(f.permissions()), []);
  } finally {
    f.cleanup();
  }
});

test("unmanaged worlds and newly created worlds never inherit an operator assignment", async () => {
  const f = fixture();
  try {
    await f.worlds.activate("Other");
    assert.deepEqual(JSON.parse(f.permissions()), []);
    await f.worlds.activate("Original");
    assert.equal(f.permissions(), original);
    await f.worlds.create({
      name: "New",
      seed: "",
      gameMode: "creative",
      difficulty: "easy",
      activate: true,
    });
    assert.deepEqual(JSON.parse(f.permissions()), []);
    assert.equal(
      f.users.list([...f.names, "New"]).users[0].permissions.Original,
      "operator",
    );
  } finally {
    f.cleanup();
  }
});

test("failed shutdown leaves permissions untouched; failed startup restores exact permissions", async () => {
  const f = fixture();
  try {
    f.state.failStop = true;
    await assert.rejects(() => f.worlds.activate("Other"), /Unable to stop/);
    assert.equal(f.permissions(), original);
    f.state.failStop = false;
    f.state.failStart = true;
    await assert.rejects(
      () => f.worlds.activate("Other"),
      /Previous configuration was restored/,
    );
    assert.equal(f.permissions(), original);
    assert.equal(f.worlds.list().activeWorld, "Original");
    assert.equal(f.state.running, true);
  } finally {
    f.cleanup();
  }
});

test("invalid identities, roles, worlds, malformed storage, and symlinks surface errors without changing permissions", () => {
  const f = fixture();
  try {
    const input = {
      xuid: first,
      alias: "",
      world: "Other",
      permission: "member",
    };
    for (const change of [
      { xuid: Number(first) },
      { xuid: "0" },
      { xuid: "18446744073709551616" },
      { xuid: "01" },
      { alias: "a\nb" },
      { alias: "a".repeat(101) },
      { permission: "admin" },
      { permission: undefined },
      { world: "../escape" },
      { world: "Missing" },
    ])
      assert.throws(() => f.users.update({ ...input, ...change }, f.names));
    assert.equal(f.permissions(), original);
    assert.equal(existsSync(join(f.runtime, ".mbs-users.json")), false);
    writeFileSync(
      join(f.runtime, "worlds", "Other", ".mbs-permissions.json"),
      "{broken",
    );
    assert.throws(() => f.users.list(f.names), /invalid JSON/);
    assert.equal(f.permissions(), original);
    rmSync(join(f.runtime, "worlds", "Other", ".mbs-permissions.json"));
    symlinkSync(
      join(f.runtime, "permissions.json"),
      join(f.runtime, "worlds", "Other", ".mbs-permissions.json"),
    );
    assert.throws(() => f.users.list(f.names), /regular file/);
    assert.equal(f.permissions(), original);
  } finally {
    f.cleanup();
  }
});

test("external permissions edits during shutdown are not overwritten", async () => {
  const f = fixture();
  try {
    const stop = f.control.stop;
    const external = '[{"xuid":"' + first + '","permission":"member"}]\n';
    f.control.stop = async () => {
      await stop();
      writeFileSync(join(f.runtime, "permissions.json"), external);
    };
    await assert.rejects(
      () => f.worlds.activate("Other"),
      /Unable to save world configuration/,
    );
    assert.equal(f.permissions(), external);
    assert.equal(f.worlds.list().activeWorld, "Original");
  } finally {
    f.cleanup();
  }
});

test("user APIs support both prefixes, validate updates, and share the world mutation gate", async () => {
  const f = fixture();
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const stopping = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const stop = f.control.stop;
  f.control.stop = async () => {
    entered?.();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await stop();
  };
  const app = createApp({
    worlds: f.worlds,
    control: f.control,
    plugins: createPluginStore(f.runtime),
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const put = (prefix: string, body: unknown) =>
      fetch(base + prefix + "/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    for (const prefix of ["", "/api"]) {
      const response = await fetch(base + prefix + "/users");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), f.users.list(f.names));
      assert.equal(
        (
          await put(prefix, {
            xuid: first,
            alias: "Tester",
            world: "Other",
            permission: "member",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await put(prefix, {
            xuid: first,
            alias: "",
            world: "Other",
            permission: "admin",
          })
        ).status,
        400,
      );
    }
    const switching = fetch(base + "/api/worlds/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Other" }),
    });
    await stopping;
    assert.equal(
      (
        await put("/api", {
          xuid: first,
          alias: "",
          world: "Other",
          permission: "operator",
        })
      ).status,
      409,
    );
    assert.equal((await fetch(base + "/api/users")).status, 409);
    release?.();
    assert.equal((await switching).status, 200);
    assert.deepEqual(await (await fetch(base + "/api/users")).json(), {
      ...f.users.list(f.names),
      activeWorld: "Other",
    });
  } finally {
    release?.();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    f.cleanup();
  }
});

test("updates preserve the private user registry and world permission files", () => {
  assert.equal(isUpdateFile(".mbs-users.json"), false);
  assert.equal(isUpdateFile("worlds/Original/.mbs-permissions.json"), false);
});

test("pending worlds accept assignments before first selection and unassigned users inherit a configured visitor default", async () => {
  const f = fixture();
  try {
    const properties = join(f.runtime, "server.properties");
    writeFileSync(
      properties,
      readFileSync(properties, "utf8").replace(
        "default-player-permission-level=member",
        "default-player-permission-level=visitor",
      ),
    );
    await f.worlds.create({
      name: "Pending",
      seed: "",
      gameMode: "creative",
      difficulty: "easy",
      activate: false,
    });
    const names = [...f.names, "Pending"];
    const result = f.users.update(
      {
        xuid: "18446744073709551615",
        alias: "Future player",
        world: "Pending",
        permission: "member",
      },
      names,
    );
    assert.equal(result.defaultPermission, "visitor");
    assert.deepEqual(
      result.users.find((user) => user.alias === "Future player")?.permissions,
      {
        Pending: "member",
      },
    );
    assert.equal(f.permissions(), original);
    await f.worlds.activate("Pending");
    assert.deepEqual(JSON.parse(f.permissions()), [
      {
        xuid: "18446744073709551615",
        permission: "member",
      },
    ]);
    assert.equal(
      f.worlds.list().worlds.find((world) => world.active)?.generated,
      false,
    );
  } finally {
    f.cleanup();
  }
});

test("malformed registries and duplicate permission entries never reset existing data", () => {
  const f = fixture();
  try {
    f.users.list(f.names);
    const registry = join(f.runtime, ".mbs-users.json");
    const invalid = '{"version":2,"users":[]}';
    writeFileSync(registry, invalid);
    assert.throws(() => f.users.list(f.names), /Unsupported user registry/);
    assert.equal(readFileSync(registry, "utf8"), invalid);
    assert.equal(f.permissions(), original);
    rmSync(registry);
    writeFileSync(
      join(f.runtime, "permissions.json"),
      JSON.stringify([
        { xuid: first, permission: "operator" },
        { xuid: first, permission: "visitor" },
      ]),
    );
    assert.throws(() => f.users.list(f.names), /duplicate XUID/);
    assert.equal(existsSync(registry), false);
  } finally {
    f.cleanup();
  }
});
