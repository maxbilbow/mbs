import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";
import { buildPlugins } from "../scripts/plugins.ts";

test("Fart packs build with linked item, recipe, original audio, and texture assets", async () => {
  const root = mkdtempSync(join(tmpdir(), "mbs-fart-assets-"));
  try {
    const sourceRoot = join(root, "sources");
    mkdirSync(sourceRoot);
    cpSync(
      resolve(import.meta.dirname, "../plugins/fart"),
      join(sourceRoot, "fart"),
      { recursive: true },
    );
    const packs = await buildPlugins({
      sourceRoot,
      outputRoot: join(root, "build"),
    });
    assert.equal(packs.length, 2);
    const behavior = packs.find((pack) => pack.kind === "behavior")!;
    const resource = packs.find((pack) => pack.kind === "resource")!;
    const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
    const manifest = json(join(behavior.output, "manifest.json"));
    assert.ok(
      manifest.modules.some(
        (module: { type: string }) => module.type === "data",
      ),
    );
    assert.ok(
      manifest.dependencies.some(
        (dependency: { uuid?: string }) =>
          dependency.uuid === resource.manifest.header.uuid,
      ),
    );
    const item = json(join(behavior.output, "items/tin_of_beans.json"))[
      "minecraft:item"
    ];
    assert.equal(item.description.identifier, "mbs:tin_of_beans");
    assert.equal(item.components["minecraft:food"].can_always_eat, true);
    assert.equal(item.components["minecraft:use_modifiers"].use_duration, 1.6);
    const recipe = json(join(behavior.output, "recipes/tin_of_beans.json"))[
      "minecraft:recipe_shapeless"
    ];
    assert.equal(recipe.result.item, item.description.identifier);
    assert.deepEqual(recipe.ingredients, [
      { item: "minecraft:iron_nugget" },
      { item: "minecraft:beetroot" },
      { item: "minecraft:beetroot" },
    ]);
    const textures = json(join(resource.output, "textures/item_texture.json"));
    const texturePath =
      textures.texture_data[item.components["minecraft:icon"]].textures;
    const png = readFileSync(join(resource.output, `${texturePath}.png`));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), 16);
    assert.equal(png.readUInt32BE(20), 16);
    const sounds = json(
      join(resource.output, "sounds/sound_definitions.json"),
    ).sound_definitions;
    for (const [index, seconds] of [0.4, 0.8, 1.6, 3].entries()) {
      const definition = sounds[`mbs.fart.${index + 1}`];
      assert.equal(definition.category, "player");
      assert.equal(
        definition.sounds.length,
        3,
        "each tier has three randomly selectable variants",
      );
      const fingerprints = new Set<string>();
      for (const sound of definition.sounds) {
        const ogg = readFileSync(join(resource.output, `${sound}.ogg`));
        assert.equal(ogg.subarray(0, 4).toString(), "OggS");
        const identification = ogg.indexOf(Buffer.from("\x01vorbis"));
        assert.ok(identification > 0);
        assert.equal(
          ogg[identification + 11],
          1,
          "positional audio must be mono",
        );
        const rate = ogg.readUInt32LE(identification + 12);
        const lastPage = ogg.lastIndexOf(Buffer.from("OggS"));
        const frames = Number(ogg.readBigUInt64LE(lastPage + 6));
        assert.equal(
          frames / rate,
          seconds,
          "every variant matches the cloud duration",
        );
        fingerprints.add(ogg.subarray(lastPage + 27).toString("hex"));
      }
      assert.equal(
        fingerprints.size,
        3,
        "variants contain different encoded audio",
      );
    }
    assert.match(
      readFileSync(join(behavior.output, "scripts/main.js"), "utf8"),
      /@minecraft\/server/,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("Fart gameplay gates, scales, follows players, and bounds poison feedback", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "mbs-fart-gameplay-"));
  try {
    const stub = join(root, "minecraft.mjs");
    writeFileSync(
      stub,
      `
      export class InvalidEntityError extends Error {}
      export class LocationInUnloadedChunkError extends Error {}
      export class LocationOutOfWorldBoundariesError extends Error {}
      export const EntityDamageCause = { magic: "magic", entityAttack: "entityAttack" };
      export const callbacks = {};
      export const players = [];
      export const system = {
        currentTick: 0,
        runInterval(callback, ticks) {
          if (ticks === 1) { callbacks.jump = callback; callbacks.jumpTicks = ticks; }
          else { callbacks.update = callback; callbacks.ticks = ticks; }
        }
      };
      export const world = { getAllPlayers() { return players; }, afterEvents: Object.fromEntries(
        ["itemCompleteUse", "entityHurt", "playerLeave", "playerSpawn"].map(name =>
          [name, { subscribe(callback) { callbacks[name] = callback; } }])
      ) };
    `,
    );
    const harness = join(root, "fart.mjs");
    await build({
      stdin: {
        contents: `import ${JSON.stringify(resolve(import.meta.dirname, "../plugins/fart/behavior/scripts/main.ts"))}; export * from ${JSON.stringify(stub)};`,
        resolveDir: root,
      },
      alias: { "@minecraft/server": stub },
      outfile: harness,
      bundle: true,
      platform: "node",
      format: "esm",
    });
    const api = await import(pathToFileURL(harness).href);
    type Location = { x: number; y: number; z: number };
    const particles: { name: string; position: Location; dimension: string }[] =
      [];
    const sounds: {
      name: string;
      position: Location;
      volume: number;
      pitch: number;
    }[] = [];
    const queries: { location: Location; maxDistance: number }[] = [];
    const targets: ReturnType<typeof entity>[] = [];
    function dimension(name: string) {
      return {
        error: undefined as Error | undefined,
        spawnParticle(effect: string, position: Location) {
          if (this.error) throw this.error;
          particles.push({ name: effect, position, dimension: name });
        },
        playSound(
          name: string,
          position: Location,
          options: { volume: number; pitch: number },
        ) {
          sounds.push({ name, position, ...options });
        },
        getEntities(query: { location: Location; maxDistance: number }) {
          queries.push(query);
          return targets.filter(
            (target) =>
              target.dimension === this &&
              Math.hypot(
                target.location.x - query.location.x,
                target.location.y - query.location.y,
                target.location.z - query.location.z,
              ) <= query.maxDistance,
          );
        },
      };
    }
    const overworld = dimension("overworld");
    const nether = dimension("nether");
    function entity(id: string, typeId = "minecraft:player") {
      return {
        id,
        typeId,
        isValid: true,
        isOnGround: true,
        isJumping: false,
        isFlying: false,
        isGliding: false,
        isSwimming: false,
        dimension: overworld,
        location: { x: 10, y: 64, z: 20 },
        direction: { x: 0, y: 0, z: 1 },
        yaw: 0,
        health: 20 as number | undefined,
        effects: new Map<string, { duration: number; amplifier: number }>(),
        applications: [] as {
          effect: string;
          duration: number;
          amplifier: number;
        }[],
        messages: [] as string[],
        error: undefined as Error | undefined,
        getViewDirection() {
          return this.direction;
        },
        getRotation() {
          return { x: 0, y: this.yaw };
        },
        getComponent() {
          return this.health === undefined
            ? undefined
            : { currentValue: this.health };
        },
        getEffect(name: string) {
          return this.effects.get(name);
        },
        addEffect(
          effect: string,
          duration: number,
          options: { amplifier: number },
        ) {
          if (this.error) throw this.error;
          this.effects.set(effect, { duration, ...options });
          this.applications.push({ effect, duration, ...options });
        },
        sendMessage(message: string) {
          this.messages.push(message);
        },
      };
    }
    const player = entity("player");
    const eat = (who = player, typeId = "mbs:tin_of_beans") =>
      api.callbacks.itemCompleteUse({ source: who, itemStack: { typeId } });
    const hurt = (damage: number, who = player, cause = "entityAttack") =>
      api.callbacks.entityHurt({
        hurtEntity: who,
        damage,
        damageSource: { cause },
      });
    const update = (tick: number) => {
      api.system.currentTick = tick;
      api.callbacks.update();
    };
    const reset = (who = player) => api.callbacks.playerSpawn({ player: who });
    assert.equal(api.callbacks.ticks, 4);

    hurt(4);
    eat(player, "minecraft:beetroot");
    hurt(4);
    assert.equal(sounds.length, 0);
    eat();
    assert.match(player.messages[0], /60 seconds/);
    assert.deepEqual(player.applications, [
      { effect: "regeneration", duration: 100, amplifier: 1 },
      { effect: "absorption", duration: 2400, amplifier: 0 },
    ]);
    eat();
    assert.equal(
      player.applications.length,
      2,
      "equal/longer health effects do not stack",
    );
    player.effects.set("regeneration", { duration: 20, amplifier: 2 });
    player.effects.set("absorption", { duration: 20, amplifier: 1 });
    eat();
    assert.equal(
      player.applications.length,
      2,
      "stronger existing health effects are not downgraded",
    );
    player.effects.set("regeneration", { duration: 20, amplifier: 1 });
    player.effects.set("absorption", { duration: 20, amplifier: 0 });
    eat();
    assert.equal(
      player.applications.length,
      4,
      "shorter equal-strength effects refresh",
    );
    for (const damage of [0, -1, NaN, Infinity]) hurt(damage);
    assert.equal(sounds.length, 0);
    const mob = entity("mob", "minecraft:zombie");
    mob.effects.set("poison", { duration: 100, amplifier: 0 });
    hurt(4, mob);
    assert.equal(sounds.length, 0);

    const nearby = entity("nearby");
    const pet = entity("pet", "minecraft:wolf");
    const far = entity("far");
    far.location.x += 4;
    const otherDimension = entity("elsewhere");
    otherDimension.dimension = nether;
    const item = entity("item", "minecraft:item");
    item.health = undefined;
    const alreadyPoisoned = entity("already-poisoned");
    alreadyPoisoned.effects.set("poison", { duration: 200, amplifier: 1 });
    targets.push(
      player,
      nearby,
      pet,
      far,
      otherDimension,
      item,
      alreadyPoisoned,
    );
    hurt(1);
    assert.equal(sounds.at(-1)?.name, "mbs.fart.1");
    assert.deepEqual(sounds.at(-1)?.position, { x: 10, y: 64.75, z: 19.45 });
    assert.equal(nearby.applications[0].duration, 40);
    assert.equal(pet.applications.length, 1);
    for (const who of [player, far, otherDimension, item, alreadyPoisoned])
      assert.equal(
        who.applications.filter(({ effect }) => effect === "poison").length,
        0,
      );
    hurt(1, nearby, "magic");
    assert.equal(
      sounds.length,
      1,
      "the cloud's poison must not trigger a new fart",
    );
    hurt(1);
    assert.equal(sounds.length, 1, "equal hits merge");
    update(4);
    assert.equal(nearby.applications.length, 1, "only one exposure per burst");
    update(8);
    const before = particles.length;
    update(12);
    assert.equal(particles.length, before, "expired cloud stops");
    targets.length = 0;

    const durations = [8, 16, 32, 60];
    const poisonDurations = [40, 60, 100, 140];
    for (const [index, damage] of [2, 4, 8, 100].entries()) {
      reset();
      eat();
      const victim = entity(`victim-${index}`);
      targets.push(victim);
      const start = api.system.currentTick;
      const initialParticles = particles.length;
      hurt(damage);
      assert.equal(sounds.at(-1)?.name, `mbs.fart.${index + 1}`);
      assert.equal(sounds.at(-1)?.volume, [0.8, 1.4, 2, 3][index]);
      assert.equal(particles.length - initialParticles, index + 1);
      assert.equal(victim.applications[0].duration, poisonDurations[index]);
      update(start + durations[index] - 4);
      assert.ok(particles.length > initialParticles);
      const last = particles.length;
      update(start + durations[index]);
      assert.equal(particles.length, last);
      targets.length = 0;
    }

    reset();
    eat();
    hurt(1);
    hurt(9);
    assert.equal(
      sounds.at(-1)?.name,
      "mbs.fart.4",
      "a stronger overlapping hit upgrades",
    );
    const soundCount = sounds.length;
    hurt(3);
    assert.equal(sounds.length, soundCount);
    player.dimension = nether;
    player.location = { x: -10, y: 90, z: 5 };
    player.direction = { x: 1, y: 0, z: 0 };
    update(api.system.currentTick + 4);
    assert.equal(particles.at(-1)?.dimension, "nether");
    assert.equal(particles.at(-1)?.position.x, -10.55 + 0.12);
    player.direction = { x: 0, y: 1, z: 0 };
    player.yaw = 90;
    update(api.system.currentTick + 4);
    assert.ok(Math.abs(particles.at(-1)!.position.x - (-9.45 + 0.12)) < 1e-10);
    player.dimension = overworld;
    player.location = { x: 10, y: 64, z: 20 };

    reset();
    const beanStart = api.system.currentTick;
    eat();
    update(beanStart + 1199);
    hurt(1);
    assert.equal(
      sounds.length,
      soundCount + 1,
      "beans last until the expiry tick",
    );
    reset();
    api.system.currentTick = beanStart;
    eat();
    update(beanStart + 1200);
    const expiredSounds = sounds.length;
    hurt(1);
    assert.equal(sounds.length, expiredSounds);
    eat();
    update(beanStart + 1800);
    eat();
    update(beanStart + 2400);
    hurt(1);
    assert.equal(
      sounds.length,
      expiredSounds + 1,
      "another tin refreshes the timer",
    );

    for (const effect of ["poison", "hunger"]) {
      reset();
      player.effects.set(effect, { duration: 100, amplifier: 0 });
      const count = sounds.length;
      hurt(1, player, effect === "poison" ? "magic" : "entityAttack");
      assert.equal(
        sounds.length,
        count + 1,
        `${effect} qualifies without beans`,
      );
      reset();
      player.effects.clear();
      hurt(1);
      assert.equal(
        sounds.length,
        count + 1,
        "removing the status removes eligibility",
      );
    }
    reset();
    eat();
    player.health = 0;
    const deadSounds = sounds.length;
    hurt(4);
    assert.equal(sounds.length, deadSounds);
    player.health = 20;
    player.isValid = false;
    hurt(4);
    assert.equal(sounds.length, deadSounds);
    player.isValid = true;
    reset();
    hurt(4);
    assert.equal(sounds.length, deadSounds, "respawn clears beans");
    eat();
    hurt(1);
    api.callbacks.playerLeave({ playerId: player.id });
    const leftParticles = particles.length;
    update(api.system.currentTick + 4);
    hurt(1);
    assert.equal(
      particles.length,
      leftParticles,
      "leaving clears beans and clouds",
    );

    const warnings: string[] = [];
    t.mock.method(console, "warn", (message: string) => warnings.push(message));
    for (const ErrorType of [
      api.InvalidEntityError,
      api.LocationInUnloadedChunkError,
      api.LocationOutOfWorldBoundariesError,
    ]) {
      reset();
      eat();
      overworld.error = new ErrorType("Transient");
      hurt(1);
      assert.match(warnings.at(-1) ?? "", /\[Fart\].*player.*Transient/);
    }
    overworld.error = undefined;
    reset();
    eat();
    const invalidTarget = entity("invalid-target");
    invalidTarget.error = new api.InvalidEntityError("Despawned");
    const validTarget = entity("valid-target");
    targets.push(invalidTarget, validTarget);
    hurt(1);
    assert.equal(
      validTarget.applications.length,
      1,
      "one despawn must not stop other targets",
    );
    assert.match(warnings.at(-1) ?? "", /invalid-target.*Despawned/);
    targets.length = 0;
    reset();
    eat();
    overworld.error = new Error("Unknown particle");
    assert.throws(() => hurt(1), /Unknown particle/);
    overworld.error = undefined;

    api.players.push(player);
    assert.equal(
      api.callbacks.jumpTicks,
      1,
      "takeoff detection checks every tick",
    );
    const sampleJump = () => {
      api.system.currentTick++;
      api.callbacks.jump();
    };
    const land = () => {
      player.isOnGround = true;
      sampleJump();
    };
    const jump = () => {
      player.isOnGround = false;
      player.isJumping = true;
      sampleJump();
    };
    reset();
    player.effects.clear();
    land();
    let jumpSounds = sounds.length;
    jump();
    assert.equal(sounds.length, jumpSounds, "healthy jumps do not fart");
    land();
    eat();
    jump();
    assert.equal(sounds.length, ++jumpSounds);
    assert.equal(sounds.at(-1)?.name, "mbs.fart.1");
    assert.equal(sounds.at(-1)?.volume, 0.8);
    const jumpParticles = particles.length;
    for (let tick = 0; tick < 10; tick++) sampleJump();
    assert.equal(
      sounds.length,
      jumpSounds,
      "holding jump in midair does not retrigger",
    );
    assert.equal(particles.length, jumpParticles);
    land();
    jump();
    assert.equal(
      sounds.length,
      ++jumpSounds,
      "holding jump can trigger a fresh takeoff after landing",
    );
    reset();
    player.effects.clear();
    player.effects.set("poison", { duration: 100, amplifier: 0 });
    land();
    const jumpVictim = entity("jump-victim");
    targets.push(jumpVictim);
    jump();
    assert.equal(
      sounds.length,
      ++jumpSounds,
      "poison alone enables jump farts",
    );
    assert.equal(
      jumpVictim.applications[0].duration,
      40,
      "jump farts retain the small poison cloud",
    );
    targets.length = 0;
    reset();
    player.effects.clear();
    player.effects.set("hunger", { duration: 100, amplifier: 0 });
    land();
    jump();
    assert.equal(
      sounds.length,
      jumpSounds,
      "hunger alone does not enable jump farts",
    );
    reset();
    player.effects.clear();
    eat();
    land();
    player.isJumping = false;
    player.isOnGround = false;
    sampleJump();
    assert.equal(
      sounds.length,
      jumpSounds,
      "walking off a ledge does not fart",
    );
    for (const state of ["isFlying", "isGliding", "isSwimming"] as const) {
      land();
      player[state] = true;
      jump();
      assert.equal(sounds.length, jumpSounds, `${state} is not a jump`);
      player[state] = false;
    }
    reset();
    player.effects.clear();
    eat();
    jump();
    assert.equal(
      sounds.length,
      jumpSounds,
      "first airborne observation after spawn is not a takeoff",
    );
    land();
    hurt(9);
    jumpSounds++;
    jump();
    assert.equal(
      sounds.length,
      jumpSounds,
      "jump cannot interrupt a larger active fart",
    );
    assert.equal(sounds.at(-1)?.name, "mbs.fart.4");
    reset();
    player.effects.clear();
    eat();
    update(api.system.currentTick + 1200);
    land();
    jump();
    assert.equal(
      sounds.length,
      jumpSounds,
      "expired beans no longer enable jumps",
    );
    land();
    eat();
    player.isValid = false;
    jump();
    assert.equal(
      sounds.length,
      jumpSounds,
      "invalid players cannot trigger jumps",
    );
    player.isValid = true;
    player.health = 0;
    land();
    jump();
    assert.equal(
      sounds.length,
      jumpSounds,
      "dead players cannot trigger jumps",
    );
    player.health = 20;
    api.callbacks.playerLeave({ playerId: player.id });
    land();
    jump();
    assert.equal(sounds.length, jumpSounds, "leaving clears jump eligibility");
  } finally {
    rmSync(root, { recursive: true });
  }
});
