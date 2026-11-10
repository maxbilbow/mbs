import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
import {
  canExcavate,
  orderedStops,
  parseJob,
  parseStop,
  routeName,
  rowPlan,
  supportsRoute,
  type BuildJob,
  type Stop,
} from "../plugins/wayworks/behavior/scripts/model.ts";
import type * as API from "./fixtures/wayworks-api.ts";

const base: BuildJob = {
  kind: "road",
  origin: { x: 0, y: 0, z: 0 },
  direction: 0,
  width: 3,
  length: 16,
  progress: 0,
  surface: "minecraft:cobblestone",
};

test("Wayworks plans exact bounds, all directions and straight rail states", () => {
  for (let direction = 0; direction < 4; direction++) {
    for (const width of [1, 2, 3, 9]) {
      const job = { ...base, direction, width, progress: 127, length: 128 };
      const plan = rowPlan(job);
      assert.equal(plan.length, width * 4);
      assert.equal(
        new Set(plan.map(({ position }) => JSON.stringify(position))).size,
        width * 4,
      );
      assert.equal(
        plan.filter(({ type }) => type === "minecraft:cobblestone").length,
        width,
      );
      assert.equal(
        plan.filter(({ type }) => type === "minecraft:air").length,
        width * 3,
      );
      const rails = rowPlan({ ...job, kind: "rail" }).filter(
        ({ type }) => type === "minecraft:rail",
      );
      assert.equal(rails.length, width);
      assert.ok(
        rails.every(({ states }) => states?.rail_direction === direction % 2),
      );
    }
  }
  assert.deepEqual(
    rowPlan({ ...base, direction: 1, progress: 2 })[4].position,
    { x: 2, y: 0, z: 0 },
  );
  assert.equal(canExcavate("minecraft:chest"), false);
  assert.equal(canExcavate("minecraft:water"), false);
  assert.equal(canExcavate("minecraft:bedrock"), false);
  assert.equal(canExcavate("minecraft:stone"), true);
  assert.equal(supportsRoute("minecraft:air"), false);
  assert.equal(supportsRoute("minecraft:short_grass"), false);
  assert.equal(supportsRoute("minecraft:water"), false);
  assert.equal(supportsRoute("wayworks:bus_stop"), true);
});

test("Wayworks validates saved jobs, route names and stop ordering", () => {
  assert.deepEqual(parseJob(JSON.stringify(base)), base);
  for (const change of [
    { width: 0 },
    { width: 10 },
    { length: 129 },
    { direction: 4 },
    { progress: -1 },
    { progress: 17 },
    { surface: "minecraft:tnt" },
    { origin: {} },
  ]) {
    assert.throws(() => parseJob(JSON.stringify({ ...base, ...change })));
  }
  assert.throws(() =>
    parseJob('{"kind":"bus","route":"Town","next":-1,"wait":0}'),
  );
  assert.equal(routeName("  Town Loop  "), "Town Loop");
  assert.throws(() => routeName("a".repeat(33)));
  assert.throws(() => routeName("Town\nLoop"));
  const stop: Stop = {
    owner: "one",
    dimension: "minecraft:overworld",
    route: "Town",
    order: 2,
    position: { x: 0, y: 0, z: 0 },
  };
  assert.deepEqual(parseStop(JSON.stringify(stop)), stop);
  const first = { ...stop, order: 1, position: { x: 2, y: 0, z: 0 } };
  assert.deepEqual(
    orderedStops(
      [stop, first, { ...stop, owner: "two" }],
      "one",
      "Town",
      stop.dimension,
    ),
    [first, stop],
  );
  assert.throws(
    () => orderedStops([stop], "one", "Town", stop.dimension),
    /two stops/,
  );
  assert.throws(
    () => orderedStops([stop, stop], "one", "Town", stop.dimension),
    /unique/,
  );
  assert.throws(
    () =>
      orderedStops(
        [stop, { ...first, position: { x: 2, y: 1, z: 0 } }],
        "one",
        "Town",
        stop.dimension,
      ),
    /same height/,
  );
});

test("Wayworks pack definitions and original assets are wired consistently", () => {
  const root = resolve("plugins/wayworks");
  const json = (path: string) =>
    JSON.parse(readFileSync(join(root, path), "utf8"));
  const behavior = json("behavior/manifest.json");
  const resource = json("resource/manifest.json");
  assert.ok(
    behavior.dependencies.some(
      (dependency: { uuid?: string }) =>
        dependency.uuid === resource.header.uuid,
    ),
  );
  assert.ok(
    behavior.modules.some((module: { type: string }) => module.type === "data"),
  );
  assert.equal(
    json("behavior/entities/worker.json")["minecraft:entity"].components[
      "minecraft:inventory"
    ].inventory_size,
    27,
  );
  const block = json("behavior/blocks/bus_stop.json")["minecraft:block"];
  assert.equal(
    block.components["minecraft:movable"].movement_type,
    "immovable",
  );
  assert.ok(
    existsSync(join(root, "behavior", block.components["minecraft:loot"])),
  );
  for (const [file, size] of [
    ["blocks/bus_stop.png", 16],
    ["items/planner.png", 16],
    ["entity/worker.png", 64],
  ] as const) {
    const bytes = readFileSync(join(root, "resource/textures", file));
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

test("Wayworks runtime construction, UI, supplies and bus routes", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "wayworks-test-"));
  try {
    const output = join(directory, "harness.mjs");
    const stub = resolve("tests/fixtures/wayworks-api.ts");
    await build({
      stdin: {
        contents: `import ${JSON.stringify(resolve("plugins/wayworks/behavior/scripts/main.ts"))}; export * from ${JSON.stringify(stub)};`,
        resolveDir: process.cwd(),
      },
      alias: { "@minecraft/server": stub, "@minecraft/server-ui": stub },
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
    });
    const api: typeof API = await import(pathToFileURL(output).href);
    const tick = () => api.callbacks.tick({});
    const job = (worker: API.Entity) =>
      worker.setDynamicProperty(
        "wayworks:job",
        JSON.stringify({ ...base, width: 1, length: 1 }),
      );
    const menu = async (
      player: API.Player,
      worker: API.Entity,
      selection: number,
      formValues?: unknown[],
    ) => {
      api.responses.push({ selection });
      if (formValues) api.responses.push({ formValues });
      api.callbacks.entity({ target: worker, player });
      await new Promise<void>((done) => setImmediate(done));
    };

    await t.test(
      "survival spends exactly once, clears three blocks, persists progress, and completes",
      () => {
        const { player, worker, dimension } = api.reset();
        worker.stock.setItem(0, { typeId: base.surface, amount: 2 });
        dimension
          .getBlock({ x: 0, y: 2, z: 0 })!
          .setPermutation(api.BlockPermutation.resolve("minecraft:stone"));
        job(worker);
        tick();
        assert.equal(worker.stock.getItem(0)?.amount, 1);
        assert.equal(dimension.getBlock(base.origin)?.typeId, base.surface);
        assert.equal(
          dimension.getBlock({ x: 0, y: 2, z: 0 })?.typeId,
          "minecraft:air",
        );
        assert.equal(
          parseJob(String(worker.getDynamicProperty("wayworks:job"))).kind,
          "road",
        );
        tick();
        assert.equal(worker.getDynamicProperty("wayworks:job"), undefined);
        assert.ok(player.messages.some((text) => text.includes("complete")));
        assert.equal(worker.stock.getItem(0)?.amount, 1);
      },
    );

    await t.test(
      "obstacles and insufficient supplies pause before any changes",
      () => {
        for (const obstacle of [
          "minecraft:chest",
          "minecraft:water",
          "minecraft:bedrock",
          undefined,
        ]) {
          const { worker, dimension } = api.reset();
          if (obstacle) {
            worker.stock.setItem(0, { typeId: base.surface, amount: 2 });
            dimension
              .getBlock({ x: 0, y: 2, z: 0 })!
              .setPermutation(api.BlockPermutation.resolve(obstacle));
          }
          job(worker);
          tick();
          assert.ok(worker.getDynamicProperty("wayworks:paused"));
          assert.equal(
            dimension.getBlock(base.origin)?.typeId,
            "minecraft:air",
          );
          assert.equal(
            worker.stock.getItem(0)?.amount,
            obstacle ? 2 : undefined,
          );
        }
      },
    );

    await t.test(
      "a failed block write refunds supplies and pauses explicitly",
      () => {
        const { worker, dimension } = api.reset();
        worker.stock.setItem(0, { typeId: base.surface, amount: 1 });
        dimension.getBlock(base.origin)!.fail = true;
        job(worker);
        tick();
        assert.equal(worker.stock.getItem(0)?.amount, 1);
        assert.match(
          String(worker.getDynamicProperty("wayworks:paused")),
          /write failure/,
        );
      },
    );

    await t.test(
      "partial row retries do not charge completed blocks twice",
      async () => {
        const { player, worker, dimension } = api.reset();
        worker.stock.setItem(0, { typeId: base.surface, amount: 3 });
        worker.setDynamicProperty(
          "wayworks:job",
          JSON.stringify({ ...base, length: 1 }),
        );
        const failed = dimension.getBlock({ x: 1, y: 0, z: 0 })!;
        failed.fail = true;
        tick();
        assert.equal(worker.stock.getItem(0)?.amount, 1);
        failed.fail = false;
        await menu(player, worker, 4);
        tick();
        assert.equal(worker.stock.getItem(0), undefined);
        assert.equal(worker.getDynamicProperty("wayworks:paused"), undefined);
        assert.equal(failed.typeId, base.surface);
      },
    );

    await t.test(
      "creative uses no supplies; disconnected owners and unloaded chunks are safe",
      () => {
        const { player, worker, dimension } = api.reset();
        job(worker);
        api.players.length = 0;
        tick();
        assert.equal(dimension.getBlock(base.origin)?.typeId, "minecraft:air");
        api.players.push(player);
        player.mode = api.GameMode.Creative;
        tick();
        assert.equal(dimension.getBlock(base.origin)?.typeId, base.surface);
        const next = api.reset();
        job(next.worker);
        next.dimension.unloaded = true;
        tick();
        assert.match(
          String(next.worker.getDynamicProperty("wayworks:paused")),
          /unloaded/,
        );
      },
    );

    await t.test(
      "worker menus start jobs, enforce ownership, transfer and return resources",
      async () => {
        const { player, worker, dimension } = api.reset();
        player.stock.setItem(0, { typeId: base.surface, amount: 8 });
        player.stock.setItem(1, { typeId: "minecraft:diamond", amount: 2 });
        await menu(player, worker, 1);
        assert.equal(player.stock.getItem(0), undefined);
        assert.equal(player.stock.getItem(1)?.amount, 2);
        assert.equal(worker.stock.getItem(0)?.amount, 8);
        await menu(player, worker, 2);
        assert.equal(player.stock.getItem(0)?.amount, 8);
        assert.equal(worker.stock.getItem(0), undefined);
        await menu(player, worker, 0, [0, 1, 3, 16, 0]);
        assert.deepEqual(
          parseJob(String(worker.getDynamicProperty("wayworks:job"))),
          { ...base, direction: 1 },
        );
        const other = new api.Player(dimension);
        await menu(other, worker, 5);
        assert.ok(worker.getDynamicProperty("wayworks:job"));
        assert.ok(
          other.messages.some((text) => text.includes("Only the recruiting")),
        );
      },
    );

    await t.test(
      "a full destination inventory keeps untransferred supplies safe",
      async () => {
        const { player, worker } = api.reset();
        for (let slot = 0; slot < player.stock.size; slot++) {
          player.stock.setItem(slot, {
            typeId: "minecraft:diamond",
            amount: 64,
          });
        }
        worker.stock.setItem(0, { typeId: base.surface, amount: 8 });
        await menu(player, worker, 2);
        assert.equal(worker.stock.getItem(0)?.amount, 8);
        assert.equal(player.stock.getItem(0)?.amount, 64);
      },
    );

    await t.test(
      "the block-use planner recruits for exactly four iron, not for free in survival",
      async () => {
        const { player, dimension } = api.reset();
        const block = dimension.getBlock({ x: 0, y: -1, z: 0 })!;
        const use = async () => {
          api.responses.push({ selection: 0 });
          const event = {
            block,
            player,
            itemStack: { typeId: "wayworks:planner" },
            isFirstEvent: true,
            cancel: false,
          };
          api.callbacks.block(event);
          assert.equal(event.cancel, true);
          await new Promise<void>((done) => setImmediate(done));
        };
        await use();
        assert.equal(dimension.entities.length, 1);
        assert.ok(player.messages.some((text) => text.includes("4 iron")));
        player.stock.setItem(0, { typeId: "minecraft:iron_ingot", amount: 5 });
        await use();
        assert.equal(dimension.entities.length, 2);
        assert.equal(player.stock.getItem(0)?.amount, 1);
        assert.equal(
          dimension.entities[1].getDynamicProperty("wayworks:owner"),
          player.id,
        );
      },
    );

    await t.test(
      "placed stops can be configured, reject duplicate numbers and clean up on break",
      async () => {
        const { player, dimension } = api.reset();
        const configure = async (x: number, order: number) => {
          const block = dimension.getBlock({ x, y: 0, z: 0 })!;
          block.setPermutation(
            api.BlockPermutation.resolve("wayworks:bus_stop"),
          );
          api.callbacks.place({ block, player });
          api.responses.push({ formValues: ["Town", order] });
          api.callbacks.block({ block, player, isFirstEvent: true });
          await new Promise<void>((done) => setImmediate(done));
          return block;
        };
        await configure(0, 1);
        const second = await configure(2, 1);
        assert.ok(player.messages.some((text) => text.includes("already has")));
        api.responses.push({ formValues: ["Town", 2] });
        api.callbacks.block({ block: second, player, isFirstEvent: true });
        await new Promise<void>((done) => setImmediate(done));
        const key = `wayworks:stop:${dimension.id}:2,0,0`;
        assert.equal(
          parseStop(String(api.world.getDynamicProperty(key))).order,
          2,
        );
        api.callbacks.break({
          block: second,
          brokenBlockPermutation: second.permutation,
        });
        assert.equal(api.world.getDynamicProperty(key), undefined);
      },
    );

    await t.test(
      "rail jobs charge foundations and rails with the correct alignment",
      () => {
        const { worker, dimension } = api.reset();
        worker.stock.setItem(0, { typeId: base.surface, amount: 1 });
        worker.stock.setItem(1, { typeId: "minecraft:rail", amount: 1 });
        worker.setDynamicProperty(
          "wayworks:job",
          JSON.stringify({
            ...base,
            kind: "rail",
            width: 1,
            length: 1,
            direction: 1,
          }),
        );
        tick();
        assert.equal(worker.stock.slots.size, 0);
        assert.equal(
          dimension.getBlock({ x: 0, y: 1, z: 0 })?.permutation.states
            .rail_direction,
          1,
        );
      },
    );

    await t.test(
      "bus workers follow ordered stops, dwell, loop and pause on missing stops",
      () => {
        const { player, worker, dimension } = api.reset();
        for (let x = 0; x <= 2; x++) {
          dimension
            .getBlock({ x, y: 0, z: 0 })!
            .setPermutation(api.BlockPermutation.resolve(base.surface));
        }
        for (const [order, x] of [
          [1, 0],
          [2, 2],
        ]) {
          const position = { x, y: 0, z: 0 };
          dimension
            .getBlock(position)!
            .setPermutation(api.BlockPermutation.resolve("wayworks:bus_stop"));
          api.world.setDynamicProperty(
            `wayworks:stop:${dimension.id}:${x},0,0`,
            JSON.stringify({
              owner: player.id,
              dimension: dimension.id,
              position,
              order,
              route: "Town",
            }),
          );
        }
        worker.setDynamicProperty(
          "wayworks:job",
          JSON.stringify({ kind: "bus", route: "Town", next: 0, wait: 0 }),
        );
        tick();
        assert.deepEqual(
          parseJob(String(worker.getDynamicProperty("wayworks:job"))),
          { kind: "bus", route: "Town", next: 1, wait: 10 },
        );
        for (let ticks = 0; ticks < 15; ticks++) tick();
        assert.equal(worker.location.x, 2.5);
        assert.equal(worker.getDynamicProperty("wayworks:paused"), undefined);
        dimension
          .getBlock({ x: 2, y: 0, z: 0 })!
          .setPermutation(api.BlockPermutation.resolve("minecraft:air"));
        tick();
        assert.match(
          String(worker.getDynamicProperty("wayworks:paused")),
          /missing stop/,
        );
      },
    );

    await t.test(
      "bus routes pause on unsupported ground or failed collision checks",
      () => {
        for (const blocked of [false, true]) {
          const { player, worker, dimension } = api.reset();
          for (const [order, x] of [
            [1, 0],
            [2, 2],
          ]) {
            const position = { x, y: 0, z: 0 };
            dimension
              .getBlock(position)!
              .setPermutation(
                api.BlockPermutation.resolve("wayworks:bus_stop"),
              );
            api.world.setDynamicProperty(
              `wayworks:stop:${dimension.id}:${x},0,0`,
              JSON.stringify({
                owner: player.id,
                dimension: dimension.id,
                position,
                order,
                route: "Town",
              }),
            );
          }
          worker.setDynamicProperty(
            "wayworks:job",
            JSON.stringify({ kind: "bus", route: "Town", next: 1, wait: 0 }),
          );
          if (blocked) worker.canTeleport = false;
          tick();
          assert.match(
            String(worker.getDynamicProperty("wayworks:paused")),
            /blocked or unsupported/,
          );
          assert.equal(worker.location.x, 0.5);
        }
      },
    );

    await t.test(
      "worker processing is capped and fairly rotates across ticks",
      () => {
        const { player, dimension } = api.reset();
        player.mode = api.GameMode.Creative;
        dimension.entities.length = 0;
        for (let x = 0; x < 20; x++) {
          const worker = dimension.spawnEntity("wayworks:worker", {
            x: x + 0.5,
            y: 1,
            z: 0.5,
          });
          worker.setDynamicProperty("wayworks:owner", player.id);
          worker.setDynamicProperty(
            "wayworks:job",
            JSON.stringify({
              ...base,
              width: 1,
              length: 1,
              origin: { x, y: 0, z: 0 },
            }),
          );
        }
        tick();
        assert.equal(
          dimension.entities.filter(
            (worker) =>
              JSON.parse(String(worker.getDynamicProperty("wayworks:job")))
                .progress === 1,
          ).length,
          16,
        );
        tick();
        assert.ok(
          dimension.entities.every((worker) => {
            const raw = worker.getDynamicProperty("wayworks:job");
            return raw === undefined || JSON.parse(String(raw)).progress === 1;
          }),
        );
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
