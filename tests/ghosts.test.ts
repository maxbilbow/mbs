import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
import {
  attuned,
  canFight,
  canSpawn,
  darkStorm,
  fullArmor,
  ids,
  platformTop,
  spectralTool,
} from "../plugins/ghosts/behavior/scripts/model.ts";
import type * as API from "./fixtures/ghosts-api.ts";

const armor = {
  head: ids.visor,
  chest: ids.chest,
  legs: ids.pants,
  feet: ids.boots,
  hand: ids.sword,
};

test("Ghosts combat requires visor, either body piece, and the sword; stealth requires all four", () => {
  assert.equal(canFight(armor), true);
  assert.equal(canFight({ ...armor, chest: undefined }), true);
  assert.equal(canFight({ ...armor, legs: undefined }), true);
  for (const change of [
    { head: undefined },
    { chest: undefined, legs: undefined },
    { hand: "minecraft:diamond_sword" },
  ]) {
    assert.equal(canFight({ ...armor, ...change }), false);
  }
  assert.equal(attuned({ ...armor, hand: undefined }), true);
  assert.equal(fullArmor(armor), true);
  for (const slot of ["head", "chest", "legs", "feet"])
    assert.equal(fullArmor({ ...armor, [slot]: undefined }), false);
  for (const tool of ["sword", "pickaxe", "axe", "shovel"])
    assert.equal(spectralTool(`ghosts:spectral_${tool}`), true);
  assert.equal(spectralTool("ghosts:spectral_visor"), false);
  assert.equal(spectralTool(), false);
});

test("Ghosts platforms catch downward crossings and edges, not ascent, warps, or blocks above", () => {
  const block = [{ x: 0, y: 4, z: 0 }];
  const previous = { x: 0.5, y: 5.1, z: 0.5 };
  const current = { ...previous, y: 4.9 };
  assert.equal(platformTop(previous, current, -0.2, block), 5);
  assert.equal(
    platformTop({ ...previous, y: 5 }, { ...current, x: 1.2 }, 0, block),
    5,
  );
  assert.equal(
    platformTop(previous, { ...current, x: 1.3 }, -0.2, block),
    undefined,
  );
  assert.equal(platformTop(previous, current, 0.2, block), undefined);
  assert.equal(
    platformTop({ ...previous, y: 4 }, current, -0.2, block),
    undefined,
  );
  assert.equal(
    platformTop({ ...previous, x: 20 }, current, -0.2, block),
    undefined,
  );
  assert.equal(
    platformTop({ ...previous, y: 20 }, current, -0.2, block),
    undefined,
  );
  assert.equal(
    platformTop(previous, current, -0.2, [...block, { x: 0, y: 3, z: 0 }]),
    5,
  );
});

test("Ghosts storm spawning enforces night, darkness, open sky, mob rule and exact population caps", () => {
  assert.equal(darkStorm(13000, true, 7, true), true);
  assert.equal(darkStorm(22999, true, 0, true), true);
  for (const [time, thunder, light, sky] of [
    [12999, true, 0, true],
    [23000, true, 0, true],
    [18000, false, 0, true],
    [18000, true, 8, true],
    [18000, true, 0, false],
  ] as const)
    assert.equal(darkStorm(time, thunder, light, sky), false);
  assert.equal(canSpawn(3, 23, true), true);
  assert.equal(canSpawn(4, 23, true), false);
  assert.equal(canSpawn(3, 24, true), false);
  assert.equal(canSpawn(0, 0, false), false);
});

test("Ghosts crafting has a bootstrap path and all custom assets resolve", () => {
  const root = resolve("plugins/ghosts");
  const json = (path: string) =>
    JSON.parse(readFileSync(join(root, path), "utf8"));
  const custom = new Set<string>();
  for (const kind of ["items", "blocks"])
    for (const file of readdirSync(join(root, "behavior", kind))) {
      const definition = json(`behavior/${kind}/${file}`)[
        kind === "items" ? "minecraft:item" : "minecraft:block"
      ];
      custom.add(definition.description.identifier);
      if (kind === "blocks") {
        assert.ok(
          existsSync(
            join(root, "behavior", definition.components["minecraft:loot"]),
          ),
        );
      } else {
        const icon = definition.components["minecraft:icon"];
        const texture = json("resource/textures/item_texture.json")
          .texture_data[icon].textures;
        assert.ok(existsSync(join(root, "resource", texture + ".png")));
      }
    }
  for (const file of readdirSync(join(root, "behavior/recipes"))) {
    const recipe = json(`behavior/recipes/${file}`)["minecraft:recipe_shaped"];
    assert.deepEqual(recipe.unlock, [{ item: ids.ectoplasm }]);
    assert.ok(custom.has(recipe.result.item));
    for (const ingredient of Object.values(recipe.key) as { item: string }[])
      assert.ok(
        ingredient.item === "minecraft:stick" ||
          ingredient.item === ids.ectoplasm,
      );
  }
  const ectoplasm = json("behavior/blocks/ectoplasm.json")["minecraft:block"]
    .components;
  assert.equal(ectoplasm["minecraft:collision_box"], false);
  assert.equal(ectoplasm["minecraft:selection_box"].size[1], 2);
  assert.equal(
    ectoplasm["minecraft:destructible_by_mining"].seconds_to_destroy,
    0.15,
  );
});

test("Ghosts simulated runtime gates combat, platforms, rendering, stealth and deposits", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ghosts-test-"));
  try {
    const output = join(directory, "runtime.mjs");
    const stub = resolve("tests/fixtures/ghosts-api.ts");
    await build({
      stdin: {
        contents: `import ${JSON.stringify(resolve("plugins/ghosts/behavior/scripts/main.ts"))}; export * from ${JSON.stringify(stub)};`,
        resolveDir: process.cwd(),
      },
      alias: { "@minecraft/server": stub },
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
    });
    const api: typeof API = await import(pathToFileURL(output).href);
    const equip = (player: API.Player, gear = armor) => {
      player.equipment.clear();
      for (const [slot, type] of Object.entries(gear))
        if (type) player.equipment.set(slot, new api.ItemStack(type));
    };
    const tick = (period: number) => api.intervals.get(period)!();

    await t.test(
      "unauthorized damage is canceled, authorized melee and admin kill work; only kills drop ectoplasm",
      () => {
        const { player, dimension } = api.reset();
        const specter = dimension.spawnEntity(ids.specter, player.location);
        const hurt = {
          hurtEntity: specter,
          damageSource: { damagingEntity: player, cause: "entityAttack" },
          cancel: false,
        };
        api.world.beforeEvents.entityHurt.emit(hurt);
        assert.equal(hurt.cancel, true);
        equip(player);
        hurt.cancel = false;
        api.world.beforeEvents.entityHurt.emit(hurt);
        assert.equal(hurt.cancel, false);
        const preCanceled = { ...hurt, cancel: true };
        api.world.beforeEvents.entityHurt.emit(preCanceled);
        assert.equal(preCanceled.cancel, true);
        const admin = {
          ...hurt,
          damageSource: { cause: "selfDestruct" },
        };
        api.world.beforeEvents.entityHurt.emit(admin);
        assert.equal(admin.cancel, false);
        api.world.afterEvents.entityDie.emit({
          deadEntity: specter,
          damageSource: { cause: "selfDestruct" },
        });
        assert.equal(dimension.drops.length, 0);
        api.world.afterEvents.entityDie.emit({
          deadEntity: specter,
          damageSource: hurt.damageSource,
        });
        assert.equal(dimension.drops[0].typeId, ids.ectoplasm);
        assert.ok(
          dimension.drops[0].amount >= 1 && dimension.drops[0].amount <= 3,
        );
      },
    );

    await t.test(
      "only visor wearers see particles; ghosts do not attack unattuned players or ignore full armor",
      () => {
        const { player, dimension } = api.reset();
        dimension.spawnEntity(ids.specter, player.location);
        const bystander = new api.Player(dimension);
        api.players.push(bystander);
        tick(2);
        assert.equal(player.particles.length, 0);
        assert.equal(player.damage, 0);
        equip(player);
        tick(2);
        assert.equal(player.particles.length, 1);
        assert.equal(bystander.particles.length, 0);
        assert.equal(player.damage, 3);
        assert.equal(bystander.damage, 0);
        tick(2);
        assert.equal(player.damage, 3);
      },
    );

    await t.test(
      "boots catch a landing and permit jumping; removing boots or sneaking permits passage",
      () => {
        const { player, dimension } = api.reset();
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType(ids.block);
        equip(player);
        tick(1);
        player.location.y = 0.9;
        player.velocity.y = -0.1;
        player.isJumping = true;
        tick(1);
        assert.equal(player.location.y, 1);
        assert.ok(Math.abs(player.velocity.y - 0.42) < 1e-10);
        player.isJumping = false;
        player.isSneaking = true;
        player.velocity.y = -0.1;
        player.location.y = 0.9;
        tick(1);
        assert.equal(player.location.y, 0.9);
        player.isSneaking = false;
        player.equipment.delete("feet");
        tick(1);
        assert.equal(player.location.y, 0.9);
      },
    );

    await t.test(
      "harvesting requires tools, using platforms requires boots, ectoplasm stays accessible",
      () => {
        const { player, dimension } = api.reset();
        const block = dimension.getBlock({ x: 0, y: 0, z: 0 });
        block.setType(ids.block);
        const event = { player, block, cancel: false };
        api.world.beforeEvents.playerBreakBlock.emit(event);
        assert.equal(event.cancel, true);
        event.cancel = false;
        const tool = {
          ...event,
          itemStack: new api.ItemStack("ghosts:spectral_shovel"),
        };
        api.world.beforeEvents.playerBreakBlock.emit(tool);
        assert.equal(tool.cancel, false);
        api.world.beforeEvents.playerInteractWithBlock.emit(event);
        assert.equal(event.cancel, true);
        block.setType(ids.ectoplasm);
        event.cancel = false;
        api.world.beforeEvents.playerBreakBlock.emit(event);
        api.world.beforeEvents.playerInteractWithBlock.emit(event);
        assert.equal(event.cancel, false);
      },
    );

    await t.test(
      "full-set invisibility never truncates an existing potion",
      () => {
        const { player } = api.reset();
        equip(player);
        tick(1);
        assert.equal(player.effects.get("invisibility")?.duration, 40);
        player.effects.set("invisibility", { duration: 600 });
        tick(1);
        assert.equal(player.effects.get("invisibility")?.duration, 600);
        player.effects.clear();
        player.equipment.delete("legs");
        tick(1);
        assert.equal(player.effects.size, 0);
      },
    );

    await t.test(
      "confirmed storms deposit snow-like ectoplasm and spawn capped ghosts; no bootstrap gear needed",
      () => {
        const originalRandom = Math.random;
        Math.random = () => 0;
        try {
          const { dimension } = api.reset();
          dimension
            .getBlock({ x: 8, y: 0, z: 0 })
            .setType("minecraft:grass_block");
          tick(400);
          const probe = dimension.getEntities({ type: ids.probe })[0];
          assert.ok(probe);
          probe.properties.set("ghosts:storm", true);
          api.deferred.splice(0).forEach((callback) => callback());
          assert.equal(
            dimension.getBlock({ x: 8, y: 1, z: 0 }).typeId,
            ids.ectoplasm,
          );
          assert.equal(dimension.getEntities({ type: ids.specter }).length, 1);
          assert.equal(probe.isValid, false);
        } finally {
          Math.random = originalRandom;
        }
      },
    );

    await t.test(
      "clear weather, darkness failures, occupied sites and disabled mob spawning are respected",
      () => {
        const originalRandom = Math.random;
        Math.random = () => 0;
        try {
          for (const condition of [
            "clear",
            "light",
            "roof",
            "occupied",
            "mob-rule",
            "cap",
            "unloaded",
          ]) {
            const { dimension } = api.reset();
            dimension
              .getBlock({ x: 8, y: 0, z: 0 })
              .setType("minecraft:grass_block");
            tick(400);
            const probe = dimension.getEntities({ type: ids.probe })[0];
            probe.properties.set("ghosts:storm", condition !== "clear");
            const site = dimension.getBlock({ x: 8, y: 1, z: 0 });
            if (condition === "light") site.light = 8;
            if (condition === "roof")
              dimension
                .getBlock({ x: 8, y: 20, z: 0 })
                .setType("minecraft:glass");
            if (condition === "occupied") site.setType("minecraft:chest");
            if (condition === "mob-rule")
              api.world.gameRules.doMobSpawning = false;
            if (condition === "cap")
              for (let count = 0; count < 4; count++)
                dimension.spawnEntity(ids.specter, { x: 8, y: 1, z: 0 });
            if (condition === "unloaded") dimension.unloaded = true;
            api.deferred.splice(0).forEach((callback) => callback());
            assert.equal(
              dimension.getEntities({ type: ids.specter }).length,
              condition === "cap" ? 4 : 0,
              condition,
            );
            dimension.unloaded = false;
            if (condition === "mob-rule" || condition === "cap")
              assert.equal(site.typeId, ids.ectoplasm);
            else assert.notEqual(site.typeId, ids.ectoplasm, condition);
          }
        } finally {
          Math.random = originalRandom;
        }
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
