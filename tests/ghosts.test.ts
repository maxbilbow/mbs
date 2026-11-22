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

test("Ghosts boots anchor vertically while leggings resist horizontal entry, traversal and short-step tunneling", () => {
  const block = [{ x: 0, y: 4, z: 0 }];
  const previous = { x: 0.5, y: 5.1, z: 0.5 };
  const current = { ...previous, y: 4.9 };
  const boots = { feet: ids.boots };
  const pants = { legs: ids.pants };
  assert.equal(ghostCollision(previous, current, block, boots).y, 5);
  assert.equal(ghostCollision(previous, current, block, pants).y, current.y);
  assert.equal(
    ghostCollision({ ...previous, y: 5 }, { ...current, x: 1.2 }, block, boots)
      .y,
    5,
  );
  assert.deepEqual(
    ghostCollision({ ...previous, y: 5 }, { ...current, x: 1.2 }, block, armor),
    { ...current, x: 1.2, y: 5 },
  );
  assert.equal(
    ghostCollision(previous, { ...current, x: 1.31 }, block, boots).y,
    current.y,
  );
  assert.equal(
    ghostCollision(previous, current, [...block, { x: 0, y: 3, z: 0 }], boots)
      .y,
    5,
  );
  const wall = [{ x: 0, y: 0, z: 0 }];
  for (const axis of ["x", "z"] as const) {
    for (const [from, to] of [
      [-0.4, 1.4],
      [1.4, -0.4],
    ]) {
      const start = { x: 0.5, y: 0, z: 0.5, [axis]: from };
      assert.equal(
        ghostCollision(start, { ...start, [axis]: to }, wall, pants)[axis],
        from + (to - from) * 0.02,
      );
      assert.equal(
        ghostCollision(start, { ...start, [axis]: to }, wall, boots)[axis],
        to,
      );
    }
  }
  assert.ok(
    Math.abs(
      ghostCollision(
        { x: 0.5, y: 0, z: 0.5 },
        { x: 0.5, y: 0.5, z: 0.5 },
        [{ x: 0, y: 2, z: 0 }],
        boots,
      ).y - 0.2,
    ) < 1e-10,
  );
  assert.deepEqual(
    ghostCollision({ ...previous, x: 20 }, current, block, armor),
    current,
  );
  assert.deepEqual(
    ghostCollision({ ...previous, y: 20 }, current, block, armor),
    current,
  );
  const embedded = { x: 0.5, y: 0, z: 0.5 };
  const falling = { x: 1, y: -0.2, z: 1 };
  assert.deepEqual(ghostCollision(embedded, falling, wall, armor), {
    x: 0.51,
    y: 0,
    z: 0.51,
  });
  assert.deepEqual(ghostCollision(embedded, falling, wall, pants), {
    x: 0.51,
    y: -0.2,
    z: 0.51,
  });
  assert.equal(
    ghostCollision(embedded, { ...embedded, x: 2 }, wall, boots).x,
    2,
  );
  assert.deepEqual(ghostCollision(embedded, falling, wall, {}), falling);
});

test("Ghosts hover is surface-bound, allows normal ascent, and does not lift players up walls or over voids", () => {
  assert.equal(hoverHeight(1, 0, 1), 1.125);
  assert.equal(hoverHeight(1.125, -0.08, 1), 1.125);
  assert.equal(hoverHeight(1.175, -0.08, 1), 1.125);
  assert.equal(hoverHeight(1.125, 0.2, 1), undefined);
  assert.equal(hoverHeight(1, 0, 2), undefined);
  assert.equal(hoverHeight(1.125, 0, -3), undefined);
  assert.equal(hoverHeight(0.9, -0.08, 1), undefined);
  assert.equal(hoverHeight(0.9, -0.08, 1, true), 1.125);
  assert.equal(hoverHeight(0.8, -0.08, 1, true), undefined);
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
    assert.ok(
      JSON.stringify(recipe.unlock) ===
        JSON.stringify([{ item: ids.ectoplasmBall }]) ||
        JSON.stringify(recipe.unlock) ===
          JSON.stringify([{ item: "minecraft:book" }]),
    );
    assert.ok(custom.has(recipe.result.item));
    for (const ingredient of Object.values(recipe.key) as { item: string }[])
      assert.ok(
        ingredient.item === "minecraft:stick" ||
          ingredient.item === "minecraft:book" ||
          ingredient.item === ids.ectoplasmBall,
      );
  }
  const ectoplasm = json("behavior/blocks/ectoplasm.json")["minecraft:block"]
    .components;
  assert.deepEqual(
    json("resource/manifest.json").header.version,
    json("behavior/manifest.json").dependencies.find(
      (dependency: { uuid?: string }) =>
        dependency.uuid === json("resource/manifest.json").header.uuid,
    ).version,
  );
  assert.equal(ectoplasm["minecraft:collision_box"], false);
  assert.equal(ectoplasm["minecraft:selection_box"].size[1], 2);
  assert.equal(
    ectoplasm["minecraft:destructible_by_mining"].seconds_to_destroy,
    0.15,
  );
  const definition = json("behavior/blocks/ectoplasm.json")["minecraft:block"];
  assert.deepEqual(
    definition.description.states["ghosts:layers"],
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  const bones = json("resource/models/blocks/ectoplasm.geo.json")[
    "minecraft:geometry"
  ][0].bones;
  for (let layer = 2; layer <= 8; layer++) {
    const permutation = definition.permutations[layer - 2];
    assert.equal(
      permutation.condition,
      `query.block_state('ghosts:layers') == ${layer}`,
    );
    assert.equal(
      permutation.components["minecraft:selection_box"].size[1],
      layer * 2,
    );
    assert.equal(
      permutation.components["minecraft:collision_box"].size[1],
      (layer - 1) * 2,
    );
    const loot = json(`behavior/${permutation.components["minecraft:loot"]}`);
    assert.equal(loot.pools[0].entries[0].functions[0].count, layer);
    assert.equal(loot.pools[0].entries[0].name, ids.ectoplasmBall);
    assert.ok(
      bones.some((bone: { name: string }) => bone.name === `layer${layer}`),
    );
  }
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
  const release = json("resource/particles/release.json").particle_effect;
  assert.equal(release.description.identifier, "ghosts:release");
  assert.ok(
    existsSync(
      join(
        root,
        "resource",
        release.description.basic_render_parameters.texture + ".png",
      ),
    ),
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
      alias: {
        "@minecraft/server": stub,
        "@minecraft/server-ui": stub,
      },
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
          assert.deepEqual(dimension.particles, [
            {
              type: "ghosts:release",
              point: { ...mob.location, y: mob.location.y + 0.75 },
            },
          ]);
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
          assert.equal(dimension.particles.length, expected - count);
        }
      },
    );

    await t.test(
      "monster kills roll exactly 10% hostile releases for melee and projectiles, with one guaranteed sword fallback",
      (t) => {
        let roll = 0;
        t.mock.method(Math, "random", () => roll);
        for (const scenario of [
          {
            sword: true,
            cause: "entityAttack",
            roll: 0.099999,
            monster: true,
            count: 1,
            hostile: true,
          },
          {
            sword: true,
            cause: "entityAttack",
            roll: 0.1,
            monster: true,
            count: 1,
            hostile: false,
          },
          {
            sword: false,
            cause: "entityAttack",
            roll: 0.099999,
            monster: true,
            count: 1,
            hostile: true,
          },
          {
            sword: false,
            cause: "entityAttack",
            roll: 0.1,
            monster: true,
            count: 0,
            hostile: false,
          },
          {
            sword: true,
            cause: "projectile",
            roll: 0.1,
            monster: true,
            count: 0,
            hostile: false,
          },
          {
            sword: false,
            cause: "projectile",
            roll: 0.099999,
            monster: true,
            count: 1,
            hostile: true,
          },
          {
            sword: false,
            cause: "magic",
            roll: 0,
            monster: true,
            count: 1,
            hostile: true,
          },
          {
            sword: true,
            cause: "entityAttack",
            roll: 0,
            monster: false,
            count: 1,
            hostile: false,
          },
          {
            sword: false,
            cause: "entityAttack",
            roll: 0,
            monster: false,
            count: 0,
            hostile: false,
          },
        ]) {
          const { player, dimension } = api.reset();
          equip(player, {
            hand: scenario.sword ? ids.sword : "minecraft:iron_sword",
          });
          api.world.gameRules.doMobSpawning = false;
          const mob = dimension.spawnEntity(
            scenario.monster ? "minecraft:zombie" : "minecraft:cow",
            { ...player.location },
          );
          if (scenario.monster) mob.families.add("monster");
          const damageSource = {
            damagingEntity: player,
            cause: scenario.cause,
          };
          mob.health = 0;
          api.world.beforeEvents.entityHurt.emit({
            hurtEntity: mob,
            damageSource,
            cancel: false,
          });
          roll = scenario.roll;
          api.world.afterEvents.entityDie.emit({
            deadEntity: mob,
            damageSource,
          });
          assert.equal(
            dimension.getEntities({ type: ids.specter }).length,
            scenario.count,
            JSON.stringify(scenario),
          );
          assert.equal(dimension.particles.length, scenario.count);
          tick(2);
          assert.equal(
            player.damage,
            scenario.hostile ? 3 : 0,
            JSON.stringify(scenario),
          );
        }
      },
    );

    await t.test(
      "hostile releases reject canceled, expired, mismatched and non-player kills, and respect caps without false particles",
      (t) => {
        t.mock.method(Math, "random", () => 0);
        for (const condition of [
          "canceled",
          "expired",
          "other-cause",
          "other-killer",
          "non-player",
          "nearby-cap",
          "dimension-cap",
        ]) {
          const { player, dimension } = api.reset();
          const mob = dimension.spawnEntity("minecraft:skeleton", {
            ...player.location,
          });
          mob.families.add("monster");
          const damageSource = {
            damagingEntity:
              condition === "non-player"
                ? new api.Entity("minecraft:wolf", dimension, player.location)
                : player,
            cause: "projectile",
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
          const count =
            condition === "nearby-cap"
              ? 4
              : condition === "dimension-cap"
                ? 24
                : 0;
          for (let i = 0; i < count; i++)
            dimension.spawnEntity(ids.specter, {
              x: condition === "dimension-cap" ? 100 : 1,
              y: 1,
              z: 0,
            });
          const finalSource =
            condition === "other-cause"
              ? { ...damageSource, cause: "fire" }
              : condition === "other-killer"
                ? { ...damageSource, damagingEntity: new api.Player(dimension) }
                : damageSource;
          api.world.afterEvents.entityDie.emit({
            deadEntity: mob,
            damageSource: finalSource,
          });
          assert.equal(
            dimension.getEntities({ type: ids.specter }).length,
            count,
            condition,
          );
          assert.equal(dimension.particles.length, 0, condition);
        }
      },
    );

    await t.test(
      "damage sheds layers at the exact 35% boundary and respects the successful-deposit cooldown",
      (t) => {
        const { player, dimension } = api.reset();
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:stone");
        const deposit = dimension.getBlock({ x: 0, y: 1, z: 0 });
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
        assert.equal(deposit.permutation.getAllStates()["ghosts:layers"], 1);
        api.system.currentTick = 39;
        api.world.afterEvents.entityHurt.emit(damage);
        assert.equal(deposit.permutation.getAllStates()["ghosts:layers"], 1);
        api.system.currentTick = 40;
        ghost.health = 0;
        api.world.afterEvents.entityHurt.emit(damage);
        assert.equal(deposit.permutation.getAllStates()["ghosts:layers"], 2);
        api.world.afterEvents.entityDie.emit({
          deadEntity: ghost,
          damageSource: damage.damageSource,
        });
        assert.equal(deposit.permutation.getAllStates()["ghosts:layers"], 4);
        assert.equal(dimension.drops.length, 0);
      },
    );

    await t.test(
      "idle shedding uses the exact 10% boundary for living loaded ghosts in every dimension",
      (t) => {
        api.reset();
        for (const dimension of api.dimensions.values()) {
          dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:stone");
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
          assert.equal(
            dimension.getBlock({ x: 0, y: 1, z: 0 }).permutation.getAllStates()[
              "ghosts:layers"
            ],
            1,
          );
          assert.equal(dimension.drops.length, 0);
        }
      },
    );

    await t.test(
      "ghost deposits accumulate to eight layers without replacing obstacles or dropping items",
      (t) => {
        t.mock.method(Math, "random", () => 0);
        const { dimension } = api.reset();
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:stone");
        dimension.spawnEntity(ids.specter, { x: 0, y: 4, z: 0 });
        for (let layer = 1; layer <= 9; layer++) {
          tick(400);
          assert.equal(
            dimension.getBlock({ x: 0, y: 1, z: 0 }).permutation.getAllStates()[
              "ghosts:layers"
            ],
            Math.min(layer, 8),
          );
        }
        assert.equal(dimension.drops.length, 0);
        const other = api.reset();
        other.dimension.spawnEntity(ids.specter, { x: 0, y: 4, z: 0 });
        const partial = other.dimension.getBlock({ x: 0, y: 1, z: 0 });
        partial.setType("minecraft:stone_slab");
        partial.surfaceHeight = 0.5;
        tick(400);
        assert.equal(partial.typeId, "minecraft:stone_slab");
        assert.equal(
          other.dimension.getBlock({ x: 0, y: 2, z: 0 }).isAir,
          true,
        );
        assert.equal(other.dimension.drops.length, 0);
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
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:stone");
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
        const layers = dimension
          .getBlock({ x: 0, y: 1, z: 0 })
          .permutation.getAllStates()["ghosts:layers"];
        assert.ok(typeof layers === "number" && layers >= 1 && layers <= 3);
      },
    );

    await t.test(
      "ghosts are neutral until damaged, retaliate only against their attacker and remember them without armor",
      (t) => {
        const { player, dimension } = api.reset();
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:stone");
        const ghost = dimension.spawnEntity(ids.specter, player.location);
        t.mock.method(Math, "random", () => 0);
        const bystander = new api.Player(dimension);
        api.players.push(bystander);
        tick(2);
        assert.equal(player.particles.length, 0);
        assert.equal(player.damage, 0);
        equip(player);
        tick(2);
        assert.equal(player.particles.length, 1);
        assert.equal(bystander.particles.length, 0);
        assert.equal(player.damage, 0);
        assert.deepEqual(ghost.location, player.location);
        const hit = {
          hurtEntity: ghost,
          damage: 1,
          damageSource: { damagingEntity: player, cause: "entityAttack" },
        };
        api.world.afterEvents.entityHurt.emit({ ...hit, damage: 0 });
        const canceled = { ...hit, cancel: true };
        api.world.beforeEvents.entityHurt.emit(canceled);
        assert.equal(canceled.cancel, true);
        tick(2);
        assert.equal(player.damage, 0);
        api.world.afterEvents.entityHurt.emit(hit);
        tick(2);
        assert.equal(player.damage, 3);
        assert.equal(bystander.damage, 0);
        tick(2);
        assert.equal(player.damage, 3);
        player.equipment.clear();
        api.system.currentTick = 30;
        tick(2);
        assert.equal(player.damage, 6);
        equip(bystander);
        api.world.afterEvents.entityHurt.emit({
          ...hit,
          damageSource: { ...hit.damageSource, damagingEntity: bystander },
        });
        assert.equal(
          dimension.getBlock({ x: 0, y: 1, z: 0 }).permutation.getAllStates()[
            "ghosts:layers"
          ],
          1,
          "drop cooldown does not prevent retaliation",
        );
        api.system.currentTick = 60;
        tick(2);
        assert.equal(player.damage, 6);
        assert.equal(bystander.damage, 3);
      },
    );

    await t.test(
      "ghosts pursue only their attacker and calm down when the target is lost, dies or leaves",
      () => {
        for (const condition of [
          "range",
          "dimension",
          "mode",
          "death",
          "leave",
          "removed",
        ]) {
          const { player, dimension } = api.reset();
          equip(player);
          const ghost = dimension.spawnEntity(ids.specter, {
            ...player.location,
          });
          api.world.afterEvents.entityHurt.emit({
            hurtEntity: ghost,
            damage: 1,
            damageSource: { damagingEntity: player, cause: "entityAttack" },
          });
          player.location.x = 5.5;
          const bystander = new api.Player(dimension);
          equip(bystander);
          api.players.push(bystander);
          tick(2);
          assert.ok(Math.abs(ghost.location.x - 0.62) < 1e-10, condition);
          assert.equal(bystander.damage, 0, condition);
          ghost.teleport({ ...player.location });
          if (condition === "range") {
            player.location.x += 20;
            tick(2);
            player.location.x -= 20;
          } else if (condition === "dimension") {
            player.dimension = api.dimensions.get("nether")!;
            tick(2);
            player.dimension = dimension;
          } else if (condition === "mode") {
            player.mode = api.GameMode.Creative;
            tick(2);
            player.mode = api.GameMode.Survival;
          } else if (condition === "death") {
            api.world.afterEvents.entityDie.emit({
              deadEntity: player,
              damageSource: { cause: "fall" },
            });
          } else if (condition === "leave") {
            api.world.afterEvents.playerLeave.emit({ playerId: player.id });
          } else {
            api.world.afterEvents.entityRemove.emit({
              removedEntityId: ghost.id,
            });
          }
          api.system.currentTick = 30;
          tick(2);
          assert.equal(player.damage, 0, condition);
          assert.equal(bystander.damage, 0, condition);
        }
      },
    );

    await t.test(
      "boots prevent fall damage and chestplates prevent lava and burning without a full set",
      () => {
        const { player } = api.reset();
        player.isSneaking = true;
        player.isInWater = true;
        const combinations: Gear[] = [
          {},
          { feet: ids.boots },
          { chest: ids.chest },
          armor,
          { legs: ids.pants },
        ];
        for (const equipment of combinations) {
          equip(player, equipment);
          for (const cause of [
            "fall",
            "lava",
            "fire",
            "fireTick",
            "void",
            "selfDestruct",
            "entityAttack",
            "drowning",
          ]) {
            const hurt = {
              hurtEntity: player,
              damageSource: { cause },
              cancel: false,
            };
            api.world.beforeEvents.entityHurt.emit(hurt);
            assert.equal(
              hurt.cancel,
              (cause === "fall" && equipment.feet === ids.boots) ||
                (["lava", "fire", "fireTick"].includes(cause) &&
                  equipment.chest === ids.chest),
              JSON.stringify({ equipment, cause }),
            );
          }
        }
        equip(player, { chest: ids.chest });
        tick(1);
        assert.equal(player.extinguished, 1);
        player.equipment.clear();
        tick(1);
        assert.equal(player.extinguished, 1);
        const hurt = {
          hurtEntity: player,
          damageSource: { cause: "lava" },
          cancel: false,
        };
        api.world.beforeEvents.entityHurt.emit(hurt);
        assert.equal(
          hurt.cancel,
          false,
          "removing the chestplate stops immunity immediately",
        );
      },
    );

    await t.test(
      "boots refresh short slow falling without shortening or weakening potions, and stop on removal",
      () => {
        const { player } = api.reset();
        equip(player, { feet: ids.boots });
        tick(1);
        assert.equal(player.effects.get("slow_falling")?.duration, 10);
        player.effects.set("slow_falling", { duration: 5, amplifier: 0 });
        tick(1);
        assert.equal(player.effects.get("slow_falling")?.duration, 10);
        player.effects.set("slow_falling", { duration: 600, amplifier: 0 });
        tick(1);
        assert.equal(player.effects.get("slow_falling")?.duration, 600);
        player.effects.set("slow_falling", { duration: 5, amplifier: 2 });
        tick(1);
        assert.deepEqual(player.effects.get("slow_falling"), {
          duration: 5,
          amplifier: 2,
        });
        player.equipment.clear();
        player.effects.clear();
        tick(1);
        assert.equal(player.effects.has("slow_falling"), false);
      },
    );

    await t.test(
      "spectral pants grant Speed II without replacing existing potions",
      () => {
        const { player } = api.reset();
        tick(1);
        assert.equal(player.getEffect("speed"), undefined);
        equip(player, { legs: ids.pants });
        tick(1);
        assert.deepEqual(player.getEffect("speed"), {
          duration: 10,
          amplifier: 1,
        });
        for (const effect of [
          { duration: 600, amplifier: 0 },
          { duration: 5, amplifier: 0 },
          { duration: 600, amplifier: 1 },
          { duration: 5, amplifier: 2 },
        ]) {
          player.effects.set("speed", effect);
          tick(1);
          assert.deepEqual(player.getEffect("speed"), effect);
        }
        player.effects.set("speed", { duration: 5, amplifier: 1 });
        tick(1);
        assert.deepEqual(player.getEffect("speed"), {
          duration: 10,
          amplifier: 1,
        });
        player.effects.delete("speed");
        tick(1);
        assert.equal(player.getEffect("speed")?.amplifier, 1);
        player.equipment.clear();
        player.effects.delete("speed");
        tick(1);
        assert.equal(player.getEffect("speed"), undefined);
        equip(player, { legs: ids.pants });
        player.mode = api.GameMode.Spectator;
        tick(1);
        assert.equal(player.getEffect("speed"), undefined);
        api.world.setDynamicProperty("ghosts:experimental_features", true);
        player.mode = api.GameMode.Creative;
        tick(1);
        assert.equal(player.getEffect("speed")?.amplifier, 1);
      },
    );

    await t.test(
      "boots catch a landing and permit jumping; removing boots or sneaking permits passage",
      () => {
        const { player, dimension } = api.reset();
        api.world.setDynamicProperty("ghosts:experimental_features", true);
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType(ids.block);
        equip(player, { ...armor, chest: undefined });
        tick(1);
        player.location.y = 0.9;
        player.velocity = { x: 0.2, y: -0.1, z: -0.15 };
        player.isJumping = true;
        tick(1);
        assert.equal(player.location.y, 1);
        assert.ok(Math.abs(player.velocity.y - 0.42) < 1e-10);
        assert.equal(player.velocity.x, 0.2);
        assert.equal(player.velocity.z, -0.15);
        player.isJumping = false;
        player.velocity.y = -0.1;
        tick(1);
        assert.ok(
          Math.abs(player.velocity.y - 0.08) < 1e-10,
          "standing support offsets gravity before the next tick",
        );
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
      "boots support vertically while leggings alone resist horizontally; sneak and gear removal release resistance",
      () => {
        const combinations: Gear[] = [
          { feet: ids.boots },
          { legs: ids.pants },
          { feet: ids.boots, legs: ids.pants },
        ];
        for (const equipment of combinations) {
          const { player, dimension } = api.reset();
          api.world.setDynamicProperty("ghosts:experimental_features", true);
          dimension.getBlock({ x: 1, y: 0, z: 0 }).setType(ids.block);
          equip(player, equipment);
          player.location = { x: 0.5, y: 0, z: 0.5 };
          tick(1);
          player.location.x = 1.5;
          player.location.y = -0.1;
          player.velocity = { x: 0.4, y: -0.1, z: 0 };
          tick(1);
          assert.equal(player.location.x, equipment.legs ? 0.52 : 1.5);
          assert.equal(
            player.location.y,
            equipment.feet && !equipment.legs ? 0 : -0.1,
          );
          assert.equal(player.velocity.x, equipment.legs ? 0 : 0.4);
          player.isSneaking = true;
          player.location.x = 1.5;
          player.location.y = -0.2;
          tick(1);
          assert.equal(player.location.x, 1.5);
          assert.equal(player.location.y, -0.2);
          player.isSneaking = false;
          player.equipment.clear();
          player.location.x = 2.5;
          tick(1);
          assert.equal(player.location.x, 2.5);
        }
        const { player, dimension } = api.reset();
        api.world.setDynamicProperty("ghosts:experimental_features", true);
        dimension.getBlock({ x: 0, y: 2, z: 0 }).setType(ids.block);
        equip(player, { feet: ids.boots });
        player.location = { x: 0.5, y: 0, z: 0.5 };
        tick(1);
        player.location.y = 0.5;
        player.velocity.y = 0.3;
        tick(1);
        assert.ok(Math.abs(player.location.y - 0.2) < 1e-10);
      },
    );

    await t.test(
      "horizontal collision preserves uncorrected vertical velocity",
      () => {
        const { player, dimension } = api.reset();
        api.world.setDynamicProperty("ghosts:experimental_features", true);
        dimension.getBlock({ x: 1, y: 0, z: 0 }).setType(ids.block);
        equip(player, { legs: ids.pants });
        player.location = { x: 0.5, y: 0, z: 0.5 };
        tick(1);
        player.location.x = 1.1;
        player.velocity = { x: 0.3, y: -0.12, z: 0.2 };
        tick(1);
        assert.equal(player.location.x, 0.512);
        assert.deepEqual(player.velocity, { x: 0, y: -0.12, z: 0.2 });
      },
    );

    await t.test(
      "tiny ghost-block corrections do not teleport the player",
      () => {
        const { player, dimension } = api.reset();
        api.world.setDynamicProperty("ghosts:experimental_features", true);
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType(ids.block);
        equip(player, { legs: ids.pants });
        player.location.y = 0;
        tick(1);
        player.location.x += 0.00001;
        player.velocity.x = 0.2;
        tick(1);
        assert.equal(player.location.x, 0.50001);
        assert.equal(player.velocity.x, 0.2);
      },
    );

    await t.test(
      "ghost-block movement is disabled when experimental features are off",
      () => {
        for (const equipment of [
          { feet: ids.boots },
          { legs: ids.pants },
          armor,
        ]) {
          const { player, dimension } = api.reset();
          dimension.getBlock({ x: 1, y: 0, z: 0 }).setType(ids.block);
          equip(player, equipment);
          player.location = { x: 0.5, y: 0, z: 0.5 };
          tick(1);
          player.location = { x: 1.1, y: -0.1, z: 0.5 };
          player.velocity = { x: 0.3, y: -0.1, z: 0 };
          tick(1);
          assert.deepEqual(player.location, { x: 1.1, y: -0.1, z: 0.5 });
          assert.deepEqual(player.velocity, { x: 0.3, y: -0.1, z: 0 });
          player.isJumping = true;
          tick(1);
          assert.equal(player.location.y, -0.1);
        }
      },
    );

    await t.test(
      "operator guide setting controls hovering for the world",
      async () => {
        const { player, dimension } = api.reset();
        const other = new api.Player(dimension);
        other.location.x = 2.5;
        api.players.push(other);
        for (const x of [0, 2])
          dimension.getBlock({ x, y: 0, z: 0 }).setType("minecraft:water");
        equip(player);
        equip(other);
        tick(1);
        tick(1);
        assert.equal(player.location.y, 1);
        assert.equal(other.location.y, 1);

        const openGuide = async () => {
          api.world.afterEvents.itemUse.emit({
            source: player,
            itemStack: new api.ItemStack(ids.guide),
          });
          api.deferred.shift()!();
          await new Promise<void>((resolve) => setImmediate(resolve));
        };
        api.actionResponses.push({ canceled: false, selection: 0 });
        await openGuide();
        assert.deepEqual(api.shownForms[0].buttons, []);
        assert.equal(
          api.world.getDynamicProperty("ghosts:experimental_features"),
          undefined,
        );

        player.commandPermissionLevel =
          api.CommandPermissionLevel.GameDirectors;
        api.actionResponses.push({ canceled: false, selection: 0 });
        api.modalResponses.push({ canceled: false, formValues: [true] });
        await openGuide();
        assert.deepEqual(api.shownForms.at(-2)?.buttons, ["Settings"]);
        assert.equal(api.shownForms.at(-1)?.defaultValue, false);
        assert.equal(
          api.world.getDynamicProperty("ghosts:experimental_features"),
          true,
        );
        tick(1);
        assert.equal(player.location.y, 1.125);
        assert.equal(other.location.y, 1.125);

        api.actionResponses.push({ canceled: false, selection: 0 });
        api.modalResponses.push({ canceled: true });
        await openGuide();
        assert.equal(api.shownForms.at(-1)?.defaultValue, true);
        assert.equal(
          api.world.getDynamicProperty("ghosts:experimental_features"),
          true,
        );

        api.actionResponses.push({ canceled: false, selection: 0 });
        api.modalResponses.push({ canceled: false, formValues: [false] });
        await openGuide();
        assert.equal(
          api.world.getDynamicProperty("ghosts:experimental_features"),
          false,
        );
        player.location.y = 1;
        other.location.y = 1;
        tick(1);
        assert.equal(player.location.y, 1);
        assert.equal(other.location.y, 1);

        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType(ids.block);
        player.location.y = 0.9;
        player.velocity.y = -0.1;
        tick(1);
        assert.equal(
          player.location.y,
          0.9,
          "ghost-block support is disabled with experimental features",
        );
        api.world.setDynamicProperty("ghosts:experimental_features", true);
        player.equipment.clear();
        player.location.y = 1;
        tick(1);
        equip(player);
        player.location.y = 0.9;
        player.velocity.y = -0.1;
        tick(1);
        assert.equal(player.location.y, 1, "ghost-block support is enabled");
      },
    );

    await t.test(
      "settings cannot be saved after operator permission is removed",
      async (t) => {
        const { player } = api.reset();
        player.commandPermissionLevel =
          api.CommandPermissionLevel.GameDirectors;
        api.actionResponses.push({ canceled: false, selection: 0 });
        let finish!: (value: {
          canceled: boolean;
          formValues: boolean[];
        }) => void;
        t.mock.method(
          api.ModalFormData.prototype,
          "show",
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        );
        api.world.afterEvents.itemUse.emit({
          source: player,
          itemStack: new api.ItemStack(ids.guide),
        });
        api.deferred.shift()!();
        await new Promise<void>((resolve) => setImmediate(resolve));
        player.commandPermissionLevel = api.CommandPermissionLevel.Any;
        finish({ canceled: false, formValues: [true] });
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(
          api.world.getDynamicProperty("ghosts:experimental_features"),
          undefined,
        );
        assert.ok(
          player.messages.some((message) => message.includes("Only operators")),
        );
      },
    );

    await t.test(
      "stale settings cannot overwrite another operator's change",
      async (t) => {
        const { player } = api.reset();
        player.commandPermissionLevel =
          api.CommandPermissionLevel.GameDirectors;
        api.actionResponses.push({ canceled: false, selection: 0 });
        let finish!: (value: {
          canceled: boolean;
          formValues: boolean[];
        }) => void;
        t.mock.method(
          api.ModalFormData.prototype,
          "show",
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        );
        api.world.afterEvents.itemUse.emit({
          source: player,
          itemStack: new api.ItemStack(ids.guide),
        });
        api.deferred.shift()!();
        await new Promise<void>((resolve) => setImmediate(resolve));
        api.world.setDynamicProperty("ghosts:experimental_features", true);
        finish({ canceled: false, formValues: [false] });
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(
          api.world.getDynamicProperty("ghosts:experimental_features"),
          true,
        );
        assert.ok(
          player.messages.some((message) =>
            message.includes("Settings changed"),
          ),
        );
      },
    );

    await t.test("hover offsets gravity without repeated teleports", (t) => {
      const { player, dimension } = api.reset();
      api.world.setDynamicProperty("ghosts:experimental_features", true);
      dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:water");
      equip(player);
      const teleport = t.mock.method(player, "tryTeleport");
      tick(1);
      tick(1);
      assert.equal(player.location.y, 1.125);
      assert.equal(teleport.mock.callCount(), 1);
      for (let i = 0; i < 20; i++) {
        player.velocity.y = (player.velocity.y - 0.08) * 0.98;
        player.location.y += player.velocity.y;
        tick(1);
      }
      assert.equal(teleport.mock.callCount(), 1);
      assert.ok(Math.abs(player.location.y - 1.125) < 0.001);
      player.location.y = 1.122;
      player.velocity.y = -0.08;
      tick(1);
      assert.equal(teleport.mock.callCount(), 1);
    });

    await t.test(
      "full armor climbs and descends while boot anchoring persists until boots are removed",
      () => {
        const { player, dimension } = api.reset();
        api.world.setDynamicProperty("ghosts:experimental_features", true);
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
        assert.equal(player.location.y, 0);
        player.equipment.delete("feet");
        player.location.y = -0.08;
        tick(1);
        assert.equal(player.location.y, -0.08);
      },
    );

    await t.test(
      "full armor hovers above liquids but not solid blocks without granting flight",
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
          api.world.setDynamicProperty("ghosts:experimental_features", true);
          const floor = dimension.getBlock({ x: 0, y: 0, z: 0 });
          floor.setType(type);
          floor.surfaceHeight = type.endsWith("slab") ? 0.5 : 1;
          player.location.y = floor.surfaceHeight;
          equip(player);
          tick(1);
          tick(1);
          const height = floor.surfaceHeight + (floor.isLiquid ? 0.125 : 0);
          assert.equal(player.location.y, height, type);
          player.equipment.delete("legs");
          player.location.y -= 0.08;
          tick(1);
          assert.ok(player.location.y < height);
        }
        const { player, dimension } = api.reset();
        api.world.setDynamicProperty("ghosts:experimental_features", true);
        dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:water");
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
        assert.equal(player.location.y, 1.125);
        assert.equal(player.velocity.y, 0.42);
        player.location.y = 1.6;
        tick(1);
        assert.equal(player.location.y, 1.6);
      },
    );

    await t.test(
      "nearby or covered liquids do not lift players above solid ground",
      () => {
        for (const condition of ["adjacent", "covered"] as const) {
          const { player, dimension } = api.reset();
          api.world.setDynamicProperty("ghosts:experimental_features", true);
          dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:stone");
          if (condition === "adjacent") {
            dimension.getBlock({ x: 1, y: 0, z: 0 }).setType("minecraft:water");
            player.location.x = 0.9;
          } else {
            dimension
              .getBlock({ x: 0, y: -1, z: 0 })
              .setType("minecraft:water");
          }
          equip(player);
          tick(1);
          tick(1);
          assert.equal(player.location.y, 1, condition);
        }
      },
    );

    await t.test(
      "hover recovers from shallow water contact but not swimming or immersion",
      () => {
        for (const condition of [
          "shallow",
          "deep",
          "swimming",
          "sneaking",
          "partial",
          "covered",
        ] as const) {
          const { player, dimension } = api.reset();
          api.world.setDynamicProperty("ghosts:experimental_features", true);
          dimension.getBlock({ x: 0, y: 0, z: 0 }).setType("minecraft:water");
          if (condition === "covered")
            dimension.getBlock({ x: 0, y: 1, z: 0 }).setType("minecraft:water");
          equip(
            player,
            condition === "partial" ? { ...armor, legs: undefined } : armor,
          );
          tick(1);
          player.isInWater = true;
          player.isSwimming = condition === "swimming";
          player.isSneaking = condition === "sneaking";
          player.location.y = condition === "deep" ? 0.8 : 0.9;
          player.velocity.y = -0.08;
          tick(1);
          assert.equal(
            player.location.y,
            condition === "shallow" ? 1.125 : condition === "deep" ? 0.8 : 0.9,
            condition,
          );
        }
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
        event.cancel = false;
        equip(player, { feet: ids.boots });
        api.world.beforeEvents.playerInteractWithBlock.emit(event);
        assert.equal(event.cancel, false);
        block.setType(ids.ectoplasm);
        event.cancel = false;
        api.world.beforeEvents.playerBreakBlock.emit(event);
        assert.equal(event.cancel, true);
        const ectoplasmTool = {
          ...event,
          cancel: false,
          itemStack: new api.ItemStack("minecraft:iron_shovel"),
        };
        api.world.beforeEvents.playerBreakBlock.emit(ectoplasmTool);
        assert.equal(ectoplasmTool.cancel, false);
        event.cancel = false;
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
        assert.equal(player.effects.has("invisibility"), false);
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
      "storm deposits add to an existing layer and respect the cap",
      (t) => {
        t.mock.method(Math, "random", () => 0);
        const { dimension } = api.reset();
        api.world.gameRules.doMobSpawning = false;
        dimension
          .getBlock({ x: 8, y: 0, z: 0 })
          .setType("minecraft:grass_block");
        const site = dimension.getBlock({ x: 8, y: 1, z: 0 });
        for (let layer = 1; layer <= 9; layer++) {
          tick(400);
          const probe = dimension.getEntities({ type: ids.probe })[0];
          assert.ok(probe);
          probe.properties.set("ghosts:storm", true);
          api.deferred.splice(0).forEach((callback) => callback());
          assert.equal(
            site.permutation.getAllStates()["ghosts:layers"],
            Math.min(layer, 8),
          );
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
