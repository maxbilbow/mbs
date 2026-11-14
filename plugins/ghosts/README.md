# Ghosts

Version **0.2.0**, a playable prototype of an equipment-gated spectral world.
Requires Bedrock **1.26.60+**, stable `@minecraft/server` **2.8.0**, and **both**
Ghosts packs. No vanilla entity/player definitions are replaced.

## Plan and implemented scope

- One intangible specter type, revealed only to Spectral Visor wearers within
  32 blocks, using short-lived player-specific ghost-shaped particles.
- Visor + **either** spectral body armor or pants + spectral sword is required
  to damage specters. Ordinary weapons, projectiles, explosions and environmental
  damage cannot farm them. Administrative `/kill` still works without drops.
- Specters pursue and attack survival players wearing a visor and either body
  piece, including fully armored players. Unattuned players are left alone.
  Specters have 24 health, deal 3 base damage every 1.5 seconds at close range,
  pass through walls, and drop **1-3 ectoplasm** when killed in combat.
- Four spectral armor pieces, sword, pickaxe, axe, shovel and craftable ghost
  blocks. Gear has durability, enchantment slots and ectoplasm anvil repairs.
- Spectral Boots make ghost blocks solid-like on **all faces** for the wearer,
  including their sides and undersides. Sneak to pass through. Boots enable
  block-use interactions; **any spectral tool**, including the sword, allows
  harvesting without boots.
- Ectoplasm is a pale mint, snow-like **1/8-block layer**. It is always visible
  and harvestable by hand, requires no spectral gear, and can be placed again.
  It does not stack into deeper layers or melt in this version.
- A complete armor set refreshes ordinary invisibility, without shortening an
  existing potion effect. It expires within two seconds of removing armor.
- With full armor, **sneak into a ghost block** to phase inside it. Once inside,
  hold jump to climb, sneak to descend, or release both to hold your height.
  Leave the ghost blocks to resume normal movement. Ordinary terrain stays solid;
  no blocks are replaced and no game-mode changes are made.
- Full armor automatically hovers about **1/4 block above nearby ground, water
  and lava**. Walk normally or jump for a surface-supported hop; you cannot
  ascend freely, hover across deep voids, or climb solid walls. Sneak suppresses
  hovering. Armor removal stops these movement perks immediately.

## Outdoor specters

Specters are no longer restricted to stormy nights. An outdoor player in the
Overworld has a best-effort nearby population target of **one by day** and
**three at night** (13000-22999). Every **10 seconds**, up to four players are
serviced, rotating fairly on larger servers. Each serviced player can replenish
one missing specter within 12-24 blocks, trying up to four clear open-sky sites.
Specters can float over water and do not require natural ground or darkness.

"Nearby" means within 32 blocks. Replenishment respects `doMobSpawning`, the
existing cap of four within 48 blocks, and 24 loaded Overworld specters overall.
Roofs, unloaded terrain, rapid travel, and these limits can delay or prevent a
replacement; this is not an instantaneous spawn guarantee. Nighttime extras
are not forcibly removed at sunrise. Unattuned players are still left alone.
**Ectoplasm deposition remains restricted to dark thunderstorms.**

## Progression and recipes

Find ectoplasm outdoors on dark thunderstorms, craft a visor and either body
armor or pants, then a sword. Hunt specters to speed up progression.

Use the usual vanilla armor/tool crafting-table shapes, substituting
**ectoplasm** for the material. Tools also require ordinary sticks.

| Recipe                   | Ectoplasm | Sticks | Output |
| ------------------------ | --------: | -----: | -----: |
| Visor                    |         5 |      0 |      1 |
| Body armor               |         8 |      0 |      1 |
| Pants                    |         7 |      0 |      1 |
| Boots                    |         4 |      0 |      1 |
| Sword                    |         2 |      1 |      1 |
| Pickaxe / axe            |         3 |      2 |      1 |
| Shovel                   |         1 |      2 |      1 |
| Ghost block (2x2 square) |         4 |      0 |      4 |

### Storm deposits and bonus specters

During **13000-22999** world time, every 20 seconds the script considers a
nearby surface 8-24 blocks from a player. Up to four players are serviced per
interval, rotating on larger servers. Candidate surfaces are allowlisted natural
ground within 8 blocks above / 12 below the player's feet; existing blocks are
never replaced. Open sky (no blocks overhead), local light <=7, two air blocks, and an
actual thunderstorm are required. A short-lived data-driven weather probe makes
this work when the pack is first enabled during an existing storm.

Each suitable attempt has an independent **10% ectoplasm deposit chance** and
**15% specter chance**. These are attempts, not guaranteed spawns: terrain,
lighting and weather can reject them. Specters respect `doMobSpawning`, a cap of
**4 within 48 blocks** and **24 loaded specters in the Overworld**. Ectoplasm
deposition is independent of mob spawning. Specters despawn after five minutes
of ticking time or when no player is within 64 blocks.

## Engine compromises

- **Tangibility is scripted, not per-player native collision.** All-face
  collision handles ordinary standing-player movement and sliding along faces.
  It does not stop mobs/items or provide native sneak-edge protection.
  Sneaking phases through; full-set climbing starts only after entering a ghost
  block, not simply by walking into its side. Equipping armor while embedded
  allows an exit rather than trapping the player.
  Large per-tick moves (>2 horizontal / >4 vertical blocks), teleports, swimming,
  gliding, flight and dimension changes bypass movement correction.
  Do not rely on ghost blocks as fall-arrest gear.
- **Hovering is local surface support, not flight.** It uses actual raycast
  surface heights, including partial blocks and liquids, and requires clear
  headroom. It does not rescue submerged players or stop high-speed falls.
  Lava/fire damage is suppressed and flames extinguished only while full armor
  is actively supporting the player above lava, not while immersed, sneaking,
  standing elsewhere, or after armor removal. It grants no general fire immunity.
  Movement smoothness and fall-distance behavior need multiplayer client testing.
- **Vanilla invisibility is not universal mob immunity.** Worn armor/held items
  can remain visible, some mobs still detect players, and existing aggro may
  persist. Specters ignore this camouflage. 90% player transparency is deferred;
  no global player-rendering override is installed.
- Ghost blocks are faintly visible to everyone in this first version. Only mob
  visibility is visor-gated. Specter particles disappear within 0.12 seconds of
  visor removal and are normal depth-tested sprites, not through-wall outlines.
- Armor has inventory icons and equipment behavior but no worn armor mesh yet.
  Axes/shovels dig their material groups; strip-log/path secondary actions are
  not implemented. Spectral pickaxes are intended as iron-tier tools.

## Build and installation

From the repository root:

```sh
npm run plugins:build
node --test tests/ghosts.test.ts
```

Outputs are `.build/plugins/ghosts/behavior/` and
`.build/plugins/ghosts/resource/`. Original procedural art is checked in;
regenerate it with `node plugins/ghosts/generate-assets.ts`.

When ready, back up your world, run `npm run plugins:deploy`, activate **both
Ghosts packs** in the web manager, and restart Minecraft separately. Build and
deploy commands process **all** source packs. Development does not activate or
restart the live server. Start with a disposable test world.

## In-game acceptance checklist

- [ ] Both packs load without content/script errors.
- [ ] Two clients side by side: only the visor wearer sees a summoned specter.
      Remove the visor, reconnect, and cross a dimension boundary.
- [ ] With `/summon ghosts:specter`, verify all armor/weapon combinations,
      projectile/explosion immunity, damage, death loot, and `/kill` cleanup.
- [ ] Place `/give @s ghosts:ghost_block` over a safe floor; test boot-only
      collision on every face, sliding, standing, edges, jumps, sneaking,
      boot removal, obstructions, latency, and landing after falls.
      A player without boots passes through.
- [ ] With full armor, sneak into a column of ghost blocks; test jump-to-climb,
      sneak-to-descend, holding position, leaving the column and removing armor.
      Verify ordinary blocks remain solid.
- [ ] Hover above solid ground, slabs, still/flowing water and lava; test jumps,
      low ceilings, edges, voids, swimming, sneaking, armor removal and reconnects.
      Confirm lava protection stops immediately when support or armor is lost.
- [ ] Only spectral tools harvest ghost blocks; hand mining ectoplasm works.
      Craft every recipe, repair, enchant, and verify actual equipment wear.
- [ ] With `/time set midnight` and `/weather thunder`, find deposits and ghosts
      on dark open ground. Test pack reload during a storm, roofs, torches,
      clear weather, population caps, and `doMobSpawning false`.
- [ ] In clear weather, wait outdoors for the daytime specter baseline, then
      switch to night and verify the higher target. Test replenishment after
      kills, roofs, rapid travel, other players and both population caps.
- [ ] Full-set stealth expires on removal without deleting potion invisibility.
      Verify limitations against ordinary mobs and continued specter targeting.

Automated tests cover gameplay rules, pack wiring and a simulated Script API.
A disposable headless Bedrock **1.26.63.1** world also verified error-free content
loading, all eight equipment registrations, both custom blocks, specter spawning,
thunderstorm detection, and the actual ectoplasm-deposition path. Its world and
process were removed afterwards; no live packs or world settings were changed.

For **0.2.0**, an isolated native actor with simulated player controls additionally
verified quarter-block hover clearance above stone, slabs, water and lava,
side-collision correction, ghost-column climbing, and the daytime/nighttime
population targets. Both native raycast filtering for liquids and integer
top-face coordinates are reflected in the regression simulator.

Headless tests cannot certify rendering, native movement prediction, item wear,
or AI behavior in a connected Bedrock client. The checklist is a release gate.
