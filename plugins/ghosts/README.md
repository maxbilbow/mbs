# Ghosts

Version **0.1.0**, a playable prototype of an equipment-gated spectral world.
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
- Spectral Boots let players stand and jump on otherwise non-colliding ghost
  blocks. Sneak to drop through. Boots enable block-use interactions; **any
  spectral tool**, including the sword, allows harvesting without boots.
- Ectoplasm is a pale mint, snow-like **1/8-block layer**. It is always visible
  and harvestable by hand, requires no spectral gear, and can be placed again.
  It does not stack into deeper layers or melt in this version.
- A complete armor set refreshes ordinary invisibility, without shortening an
  existing potion effect. It expires within two seconds of removing armor.

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

- **Platforms are scripted, not per-player native collision.** They support
  normal walking, falling onto a top face and jumping. They do not form solid
  walls, stop mobs/items, or provide native sneak-edge protection. Sneaking drops
  you through. High-speed falls (>4 blocks/tick), teleports, swimming, flight and
  dimension changes are not caught. Do not rely on these as fall-arrest gear.
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
      standing, edges, jumps, sneaking, boot removal, obstructions, latency,
      and landing after falls. A player without boots passes through.
- [ ] Only spectral tools harvest ghost blocks; hand mining ectoplasm works.
      Craft every recipe, repair, enchant, and verify actual equipment wear.
- [ ] With `/time set midnight` and `/weather thunder`, find deposits and ghosts
      on dark open ground. Test pack reload during a storm, roofs, torches,
      clear weather, population caps, and `doMobSpawning false`.
- [ ] Full-set stealth expires on removal without deleting potion invisibility.
      Verify limitations against ordinary mobs and continued specter targeting.

Automated tests cover gameplay rules, pack wiring and a simulated Script API.
A disposable headless Bedrock **1.26.63.1** world also verified error-free content
loading, all eight equipment registrations, both custom blocks, specter spawning,
thunderstorm detection, and the actual ectoplasm-deposition path. Its world and
process were removed afterwards; no live packs or world settings were changed.

Headless tests cannot certify rendering, native movement prediction, item wear,
or AI behavior in a connected Bedrock client. The checklist is a release gate.
