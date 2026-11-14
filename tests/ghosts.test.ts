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
import { inflateSync } from "node:zlib";
import { build } from "esbuild";
import {
  attuned,
  canFight,
  canSpawn,
  darkStorm,
  fullArmor,
  ghostCollision,
  hoverHeight,
  ids,
  nearbySpecterTarget,
  spectralTool,
  type Gear,
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

test("Ghosts blocks stop all faces, slide along walls, and prevent short-step tunneling", () => {
  const block = [{ x: 0, y: 4, z: 0 }];
  const previous = { x: 0.5, y: 5.1, z: 0.5 };
  const current = { ...previous, y: 4.9 };
  assert.equal(ghostCollision(previous, current, block).y, 5);
  assert.equal(
    ghostCollision({ ...previous, y: 5 }, { ...current, x: 1.2 }, block).y,
    5,
  );
  assert.equal(
    ghostCollision(previous, { ...current, x: 1.31 }, block).y,
    current.y,
  );
  assert.equal(
    ghostCollision(previous, current, [...block, { x: 0, y: 3, z: 0 }]).y,
    5,
  );
  const wall = [{ x: 0, y: 0, z: 0 }];
  for (const axis of ["x", "z"] as const) {
    for (const [from, to, stop] of [
      [-0.4, 1.4, -0.3],
      [1.4, -0.4, 1.3],
    ]) {
      const start = { x: 0.5, y: 0, z: 0.5, [axis]: from };
      assert.equal(
        ghostCollision(start, { ...start, [axis]: to }, wall)[axis],
        stop,
      );
    }
  }
  assert.deepEqual(
    ghostCollision({ x: -0.4, y: 0, z: 0.4 }, { x: 0.4, y: 0, z: 0.7 }, wall),
    { x: -0.3, y: 0, z: 0.7 },
  );
  assert.ok(
    Math.abs(
      ghostCollision({ x: 0.5, y: 0, z: 0.5 }, { x: 0.5, y: 0.5, z: 0.5 }, [
        { x: 0, y: 2, z: 0 },
      ]).y - 0.2,
    ) < 1e-10,
  );
  assert.deepEqual(
    ghostCollision({ ...previous, x: 20 }, current, block),
    current,
  );
  assert.deepEqual(
    ghostCollision({ ...previous, y: 20 }, current, block),
    current,
  );
  const embedded = { x: 0.5, y: 0, z: 0.5 };
  assert.equal(ghostCollision(embedded, { ...embedded, x: 2 }, wall).x, 2);
});

test("Ghosts hover is surface-bound, allows normal ascent, and does not lift players up walls or over voids", () => {
  assert.equal(hoverHeight(1, 0, 1), 1.25);
  assert.equal(hoverHeight(1.25, -0.08, 1), 1.25);
  assert.equal(hoverHeight(1.3, -0.08, 1), 1.25);
  assert.equal(hoverHeight(1.25, 0.2, 1), undefined);
  assert.equal(hoverHeight(1, 0, 2), undefined);
  assert.equal(hoverHeight(1.25, 0, -3), undefined);
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
  const ghostBlock = json("behavior/blocks/ghost_block.json")["minecraft:block"]
    .components;
  const worldTexture = json("resource/textures/terrain_texture.json")
    .texture_data[ghostBlock["minecraft:material_instances"]["*"].texture]
    .textures;
  const image = readFileSync(join(root, "resource", worldTexture + ".png"));
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < image.length; ) {
    const length = image.readUInt32BE(offset);
    if (image.toString("ascii", offset + 4, offset + 8) === "IDAT")
      chunks.push(image.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(chunks));
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      assert.equal(
        pixels[y * 65 + 1 + x * 4 + 3],
        0,
        "placed block must be fully transparent",
      );
  assert.notEqual(
    json("resource/textures/item_texture.json").texture_data.ghosts_ghost_block
      .textures,
    worldTexture,
  );
  assert.equal(ghostBlock["minecraft:light_dampening"], 0);
  assert.equal(
    json("behavior/items/ghost_block.json")["minecraft:item"].components[
      "minecraft:block_placer"
    ].replace_block_item,
    true,
  );
  for (const plane of ["xy", "xz", "yz"]) {
    const effect = json(
      `resource/particles/block_${plane}.json`,
    ).particle_effect;
    assert.equal(effect.description.identifier, `ghosts:block_${plane}`);
    assert.equal(
      effect.components["minecraft:particle_appearance_billboard"]
        .facing_camera_mode,
      `emitter_transform_${plane}`,
    );
    assert.equal(
      effect.components["minecraft:particle_lifetime_expression"].max_lifetime,
      0.26,
    );
    assert.ok(
      existsSync(
        join(
          root,
          "resource",
          effect.description.basic_render_parameters.texture + ".png",
        ),
      ),
    );
  }
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
    const equip = (player: API.Player, gear: Gear = armor) => {
      player.equipment.clear();
      for (const [slot, type] of Object.entries(gear))
        if (type) player.equipment.set(slot, new api.ItemStack(type));
    };
    const tick = (period: number) => api.intervals.get(period)!();

    await t.test(
      "sword killing blows release ghosts despite provisional zero health or a broken sword, without armor or natural spawning",
      () => {
        for (const name of ["overworld", "nether", "the_end"]) {
          const { player } = api.reset();
          const dimension = api.dimensions.get(name)!;
          player.dimension = dimension;
          equip(player, { hand: ids.sword });
          api.world.gameRules.doMobSpawning = false;
          const mob = dimension.spawnEntity(
            name === "overworld" ? "minecraft:cow" : "minecraft:salmon",
            player.location,
          );
          if (mob.typeId === "minecraft:salmon")
            mob.families = new Set(["salmon", "aquatic", "fish"]);
          const damageSource = {
            damagingEntity: player,
            cause: "entityAttack",
          };
          mob.health = 0;
          api.world.beforeEvents.entityHurt.emit({
            hurtEntity: mob,
            damageSource,
            cancel: false,
          });
          player.equipment.clear();
          api.world.afterEvents.entityDie.emit({
            deadEntity: mob,
            damageSource,
          });
          const ghosts = dimension.getEntities({ type: ids.specter });
          assert.equal(ghosts.length, 1, name);
          assert.deepEqual(ghosts[0].location, mob.location);
          assert.equal(dimension.drops.length, 0);
        }
      },
    );

    await t.test(
      "sword conversion excludes non-mobs, indirect kills, canceled hits and stale or replaced strikes",
      () => {
        for (const condition of [
          "player",
          "stand",
          "specter",
          "probe",
          "item",
          "no-health",
          "no-family",
          "vehicle",
          "ordinary-sword",
          "projectile",
          "fire-death",
          "canceled",
          "expired",
          "replaced",
          "other-killer",
        ]) {
          const { player, dimension } = api.reset();
          equip(player, {
            hand:
              condition === "ordinary-sword"
                ? "minecraft:iron_sword"
                : ids.sword,
          });
          const types: Record<string, string> = {
            player: "minecraft:player",
            stand: "minecraft:armor_stand",
            specter: ids.specter,
            probe: ids.probe,
            item: "minecraft:item",
          };
          const mob = dimension.spawnEntity(
            types[condition] ?? "minecraft:pig",
            player.location,
          );
          if (condition === "item" || condition === "no-health")
            mob.health = undefined;
          if (condition === "no-family") mob.families.clear();
          if (condition === "vehicle") mob.families.add("inanimate");
          let damageSource = {
            damagingEntity: player,
            cause: condition === "projectile" ? "projectile" : "entityAttack",
          };
          api.world.beforeEvents.entityHurt.emit({
            hurtEntity: mob,
            damageSource,
            cancel: condition === "canceled",
          });
          if (condition === "expired") {
            api.system.currentTick = 2;
            api.deferred.splice(0).forEach((callback) => callback());
          }
          if (condition === "replaced") {
            player.equipment.clear();
            api.world.beforeEvents.entityHurt.emit({
              hurtEntity: mob,
              damageSource,
              cancel: false,
            });
          }
          if (condition === "fire-death")
            damageSource = { ...damageSource, cause: "fire" };
          if (condition === "other-killer")
            damageSource = {
              ...damageSource,
              damagingEntity: new api.Player(dimension),
            };
          api.world.afterEvents.entityDie.emit({
            deadEntity: mob,
            damageSource,
          });
          assert.equal(
            dimension.getEntities({ type: ids.specter }).length,
            condition === "specter" ? 1 : 0,
            condition,
          );
        }
      },
    );

    await t.test(
      "sword releases enforce exact nearby and per-dimension caps and report blocked releases",
      () => {
        for (const [count, near, expected] of [
          [3, true, 4],
          [4, true, 4],
          [23, false, 24],
          [24, false, 24],
        ] as const) {
          const { player, dimension } = api.reset();
          equip(player, { hand: ids.sword });
          for (let i = 0; i < count; i++)
            dimension.spawnEntity(ids.specter, {
              x: near ? 1 : 100,
              y: 1,
              z: 0,
            });
          const mob = dimension.spawnEntity(
            "minecraft:zombie",
            player.location,
          );
          const damageSource = {
            damagingEntity: player,
            cause: "entityAttack",
          };
          api.world.beforeEvents.entityHurt.emit({
            hurtEntity: mob,
            damageSource,
            cancel: false,
          });
          api.world.afterEvents.entityDie.emit({
            deadEntity: mob,
            damageSource,
          });
          api.deferred.splice(0).forEach((callback) => callback());
          assert.equal(
            dimension.getEntities({ type: ids.specter }).length,
            expected,
          );
          assert.equal(
            player.messages.some((text) => text.includes("population is full")),
            expected === count,
          );
        }
      },
    );

    await t.test(
      "damage drops use actual damage, the exact 35% boundary and a successful-drop cooldown",
      (t) => {
        const { player, dimension } = api.reset();
        const ghost = dimension.spawnEntity(ids.specter, player.location);
        let roll = 0.35;
        t.mock.method(Math, "random", () => roll);
        const damage = {
          hurtEntity: ghost,
          damage: 2,
          damageSource: { damagingEntity: player, cause: "entityAttack" },
        };
        api.world.afterEvents.entityHurt.emit(damage);
        assert.equal(dimension.drops.length, 0);
        roll = 0.349999;
        api.world.afterEvents.entityHurt.emit({ ...damage, damage: 0 });
        api.world.afterEvents.entityHurt.emit({
          ...damage,
          damageSource: { cause: "selfDestruct" },
        });
        assert.equal(dimension.drops.length, 0);
        api.world.afterEvents.entityHurt.emit(damage);
        assert.equal(dimension.drops.length, 1);
        api.system.currentTick = 39;
        api.world.afterEvents.entityHurt.emit(damage);
        assert.equal(dimension.drops.length, 1);
        api.system.currentTick = 40;
        ghost.health = 0;
        api.world.afterEvents.entityHurt.emit(damage);
        assert.equal(dimension.drops.length, 2);
        assert.ok(
          dimension.drops.every(
            (item) => item.typeId === ids.ectoplasm && item.amount === 1,
          ),
        );
        api.world.afterEvents.entityDie.emit({
          deadEntity: ghost,
          damageSource: damage.damageSource,
        });
        assert.equal(dimension.drops.length, 3);
        assert.ok(
          dimension.drops[2].amount >= 1 && dimension.drops[2].amount <= 3,
        );
      },
    );

    await t.test(
      "idle shedding uses the exact 10% boundary for living loaded ghosts in every dimension",
      (t) => {
        api.reset();
        for (const dimension of api.dimensions.values()) {
          dimension.spawnEntity(ids.specter, { x: 0, y: 1, z: 0 });
          dimension.spawnEntity("minecraft:cow", { x: 0, y: 1, z: 0 });
          dimension.spawnEntity(ids.specter, { x: 0, y: 1, z: 0 }).health = 0;
        }
        let roll = 0.1;
        t.mock.method(Math, "random", () => roll);
        tick(400);
        for (const dimension of api.dimensions.values())
          assert.equal(dimension.drops.length, 0);
        roll = 0.099999;
        tick(400);
        for (const dimension of api.dimensions.values()) {
          assert.equal(dimension.drops.length, 1);
          assert.equal(dimension.drops[0].typeId, ids.ectoplasm);
          assert.equal(dimension.drops[0].amount, 1);
        }
      },
    );

    await t.test(
      "block outlines are visor-only, six-faced, nearest-first and bounded to 32 blocks within eight blocks",
      () => {
        const { player, dimension } = api.reset();
        const bystander = new api.Player(dimension);
        api.players.push(bystander);
        const nearest = { x: 0, y: 0, z: 0 };
        for (let x = -4; x <= 4; x++)
          for (let z = -4; z <= 4; z++)
            dimension.getBlock({ x, y: 0, z }).setType(ids.block);
        dimension.getBlock({ x: 12, y: 0, z: 0 }).setType(ids.block);
        tick(5);
        assert.equal(player.particles.length, 0);
        equip(player, { head: ids.visor });
        tick(5);
        assert.equal(player.particles.length, 32 * 6);
        assert.equal(bystander.particles.length, 0);
        assert.deepEqual(player.particlePoints.slice(0, 6), [
          { type: "ghosts:block_yz", point: { x: 0, y: 0.5, z: 0.5 } },
          { type: "ghosts:block_yz", point: { x: 1, y: 0.5, z: 0.5 } },
          { type: "ghosts:block_xz", point: { x: 0.5, y: 0, z: 0.5 } },
          { type: "ghosts:block_xz", point: { x: 0.5, y: 1, z: 0.5 } },
          { type: "ghosts:block_xy", point: { x: 0.5, y: 0.5, z: 0 } },
          { type: "ghosts:block_xy", point: { x: 0.5, y: 0.5, z: 1 } },
        ]);
        assert.ok(player.particlePoints.every(({ point }) => point.x < 9));
        dimension.getBlock(nearest).setType("minecraft:air");
        tick(5);
        assert.equal(player.particles.length, 63 * 6);
        player.equipment.clear();
        tick(5);
        assert.equal(player.particles.length, 63 * 6);
        equip(player, { head: ids.visor });
        player.dimension = api.dimensions.get("nether")!;
        tick(5);
        assert.equal(player.particles.length, 63 * 6);
        player.dimension = dimension;
        player.location = { x: 12.5, y: 1, z: 0.5 };
        tick(5);
        assert.equal(player.particles.length, 64 * 6);
        player.location.y = 400;
        tick(5);
        assert.equal(player.particles.length, 64 * 6);
        const fresh = api.reset();
        fresh.player.location.y = 0.5;
        equip(fresh.player, { head: ids.visor });
        for (const x of [7, 8, 9])
          fresh.dimension.getBlock({ x, y: 0, z: 0 }).setType(ids.block);
        tick(5);
        assert.equal(
          fresh.player.particles.length,
          12,
          "include exactly eight blocks away, exclude farther",
        );
        api.system.currentTick = 20;
        fresh.dimension.unloaded = true;
        tick(5);
        assert.equal(
          fresh.player.particles.length,
          12,
          "ignore unloaded terrain",
        );
      },
    );

    await t.test(
      "unauthorized damage is canceled, authorized melee works, and combat death loot excludes admin kills",
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
        equip(player, { ...armor, chest: undefined });
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
      "boots stop side and underside entry, while sneak and removing boots permit passage",
      () => {
        const { player, dimension } = api.reset();
        dimension.getBlock({ x: 1, y: 0, z: 0 }).setType(ids.block);
        equip(player);
        player.location = { x: 0.5, y: 0, z: 0.5 };
        tick(1);
        player.location.x = 1.5;
        player.velocity.x = 0.4;
        tick(1);
        assert.equal(player.location.x, 0.7);
        assert.equal(player.velocity.x, 0);
        player.isSneaking = true;
        player.location.x = 1.5;
        tick(1);
        assert.equal(player.location.x, 1.5);
        player.isSneaking = false;
        player.equipment.delete("feet");
        player.location.x = 2.5;
        tick(1);
        assert.equal(player.location.x, 2.5);
        dimension.getBlock({ x: 2, y: 2, z: 0 }).setType(ids.block);
        equip(player, { ...armor, chest: undefined });
        tick(1);
        player.location.y = 0.5;
        player.velocity.y = 0.3;
        tick(1);
        assert.ok(Math.abs(player.location.y - 0.2) < 1e-10);
      },
    );

    await t.test(
      "full armor climbs within ghost blocks, holds still, descends and stops immediately on armor loss",
      () => {
        const { player, dimension } = api.reset();
        for (let y = 0; y < 4; y++)
          dimension.getBlock({ x: 0, y, z: 0 }).setType(ids.block);
        equip(player);
        player.location.y = 0;
        tick(1);
        player.isJumping = true;
        tick(1);
        assert.equal(player.location.y, 0.12);
        player.isJumping = false;
        player.location.y -= 0.08;
        player.velocity.y = -0.08;
        tick(1);
        assert.equal(player.location.y, 0.12);
        player.isSneaking = true;
        tick(1);
        assert.equal(player.location.y, 0);
        player.equipment.delete("legs");
        player.isSneaking = false;
        player.location.y = -0.08;
        tick(1);
        assert.equal(player.location.y, -0.08);
      },
    );

    await t.test(
      "full armor hovers above ground, partial blocks, water and lava without granting flight or fire immunity",
      () => {
        for (const type of [
          "minecraft:stone",
          "minecraft:water",
          "minecraft:flowing_water",
          "minecraft:lava",
          "minecraft:flowing_lava",
          "minecraft:stone_slab",
        ]) {
          const { player, dimension } = api.reset();
          const floor = dimension.getBlock({ x: 0, y: 0, z: 0 });
          floor.setType(type);
          floor.surfaceHeight = type.endsWith("slab") ? 0.5 : 1;
          player.location.y = floor.surfaceHeight;
          equip(player);
          tick(1);
          tick(1);
          assert.equal(player.location.y, floor.surfaceHeight + 0.25, type);
          const hurt = {
            hurtEntity: player,
            damageSource: { cause: "lava" },
            cancel: false,
          };
          api.world.beforeEvents.entityHurt.emit(hurt);
          assert.equal(hurt.cancel, type.includes("lava"));
          if (type.includes("lava")) {
            assert.ok(player.extinguished > 0);
            player.isSneaking = true;
            hurt.cancel = false;
            api.world.beforeEvents.entityHurt.emit(hurt);
            assert.equal(hurt.cancel, false);
            player.isSneaking = false;
            player.location.x += 1;
            api.world.beforeEvents.entityHurt.emit(hurt);
            assert.equal(hurt.cancel, false);
            player.location.x -= 1;
          }
          player.equipment.delete("legs");
          hurt.cancel = false;
          api.world.beforeEvents.entityHurt.emit(hurt);
          assert.equal(hurt.cancel, false);
          player.location.y -= 0.08;
          tick(1);
          assert.ok(player.location.y < floor.surfaceHeight + 0.25);
        }
        const { player, dimension } = api.reset();
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:stone");
        equip(player);
        tick(1);
        player.canTeleport = false;
        tick(1);
        assert.equal(player.location.y, 1);
        player.canTeleport = true;
        player.isSneaking = true;
        tick(1);
        assert.equal(player.location.y, 1);
        player.isSneaking = false;
        player.location = { x: 1.5, y: 1, z: 0.5 };
        tick(1);
        assert.equal(player.location.y, 1);
        player.velocity.y = 0.3;
        player.location.x = 0.5;
        tick(1);
        assert.equal(player.location.y, 1);
        player.velocity.y = 0;
        player.isJumping = true;
        tick(1);
        assert.equal(player.location.y, 1.25);
        assert.equal(player.velocity.y, 0.42);
        player.location.y = 1.6;
        tick(1);
        assert.equal(player.location.y, 1.6);
      },
    );

    await t.test(
      "outdoors has a daytime baseline and a higher nighttime target, independent of storms",
      () => {
        const { player, dimension } = api.reset();
        api.setTime(6000);
        for (let check = 0; check < 5; check++) tick(200);
        assert.equal(dimension.getEntities({ type: ids.specter }).length, 1);
        assert.equal(nearbySpecterTarget(12999), 1);
        assert.equal(nearbySpecterTarget(13000), 3);
        assert.equal(nearbySpecterTarget(22999), 3);
        assert.equal(nearbySpecterTarget(23000), 1);
        api.setTime(18000);
        for (let check = 0; check < 5; check++) tick(200);
        assert.equal(dimension.getEntities({ type: ids.specter }).length, 3);
        dimension.entities[0].remove();
        tick(200);
        assert.equal(dimension.getEntities({ type: ids.specter }).length, 3);
        assert.equal(player.equipment.size, 0);
        assert.equal(dimension.drops.length, 0);
      },
    );

    await t.test(
      "outdoor spawning honors roofs, mob rules, nearby/global caps and unavailable chunks",
      () => {
        for (const condition of [
          "roof",
          "mob-rule",
          "nearby",
          "global",
          "unloaded",
        ]) {
          const { player, dimension } = api.reset();
          if (condition === "roof")
            dimension.getBlock({ x: 0, y: 4, z: 0 }).setType("minecraft:stone");
          if (condition === "mob-rule")
            api.world.gameRules.doMobSpawning = false;
          const count =
            condition === "nearby" ? 4 : condition === "global" ? 24 : 0;
          for (let index = 0; index < count; index++)
            dimension.spawnEntity(ids.specter, {
              x: condition === "global" ? 100 : player.location.x,
              y: 1,
              z: 0,
            });
          if (condition === "unloaded") dimension.unloaded = true;
          tick(200);
          assert.equal(
            dimension.getEntities({ type: ids.specter }).length,
            count,
            condition,
          );
        }
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
