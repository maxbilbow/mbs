# Ghosts

Version **0.4.0**, a playable prototype of an equipment-gated spectral world.
Requires Bedrock **1.26.60+**, stable `@minecraft/server` **2.8.0**, and **both**
Ghosts packs. No vanilla entity/player definitions are replaced.

## Plan and implemented scope

- One intangible specter type, revealed only to Spectral Visor wearers within
  32 blocks, using short-lived player-specific ghost-shaped particles.
- Visor + **either** spectral body armor or pants + spectral sword is required
  to damage specters. Ordinary weapons, projectiles, explosions and environmental
  damage cannot farm them. Administrative `/kill` still works without drops.
- Specters are **neutral by default**. A successful damaging melee hit provokes
  only that specter against the attacking survival player, not nearby bystanders.
  Removing armor or becoming invisible does not erase its anger. The most recent
  damaging survival attacker becomes its target. Canceled and zero-damage hits
  do not provoke it; retaliation is independent of ectoplasm drops/cooldowns.
  Specters have 24 health, deal 3 base damage every 1.5 seconds at close range,
  pass through walls, and drop **1-3 ectoplasm** when killed in combat.
  They calm down if their target dies, leaves, changes dimension/game mode, or
  reaches **20 blocks away**. Reloading the script also resets their anger.
- A direct spectral-sword killing blow on a living non-player mob releases a
  specter at its death location, even without armor. Players, armor stands,
  existing specters and weather probes do not qualify; projectiles, fire and
  other indirect kills do not count. Normal mob loot is unchanged.
- Loaded specters each have a **10% chance every 20 seconds** to shed one
  ectoplasm item. Actual damaging player melee hits have a **35% chance** to
  shed another, with a **two-second cooldown after a successful damage drop**.
  Canceled or zero-damage hits do not count. Death loot remains independent.
- Four spectral armor pieces, sword, pickaxe, axe, shovel and craftable ghost
  blocks. Gear has durability, enchantment slots and ectoplasm anvil repairs.
- Spectral Boots make ghost blocks solid-like on **all faces** for the wearer,
  including their sides and undersides. Sneak to pass through. Boots enable
  block-use interactions; **any spectral tool**, including the sword, allows
  harvesting without boots.
- Spectral Boots also prevent **all fall damage** and refresh vanilla **Slow
  Falling**, without needing other armor. Slow Falling expires within half a
  second of boot removal; longer or stronger potion effects are preserved.
- The spectral chestplate grants **lava, fire and burning immunity**, including
  while submerged or sneaking, and extinguishes flames. Other armor is not
  required. Removing the chestplate stops immunity immediately. These armor
  perks apply in survival/creative and do not protect against void damage,
  suffocation, drowning or attacks.
- Placed ghost blocks are invisible without a visor. Visor wearers see
  short-lived cube outlines of the **nearest 32 blocks within eight blocks**.
  Inventory icons remain visible; boots and tools still control tangibility
  and harvesting independently of the visor.
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
are not forcibly removed at sunrise. Unprovoked specters leave players alone.
**Ectoplasm deposition remains restricted to dark thunderstorms.**

Sword-released specters work in all three dimensions, independently of
`doMobSpawning`. They respect the same **four within 48 blocks** and **24 loaded
specters per dimension** caps; a rate-limited message reports a blocked release.

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
  Collision alone is not fall-arrest gear; wear the boots for fall immunity.
- **Hovering is local surface support, not flight.** It uses actual raycast
  surface heights, including partial blocks and liquids, and requires clear
  headroom. It does not rescue submerged players or stop high-speed falls.
  Lava/fire immunity comes from the chestplate, independently of hover support.
  Movement smoothness and fall-distance behavior need multiplayer client testing.
- **Vanilla invisibility is not universal mob immunity.** Worn armor/held items
  can remain visible, some mobs still detect players, and existing aggro may
  persist. Specters ignore this camouflage. 90% player transparency is deferred;
  no global player-rendering override is installed.
- Per-viewer block materials are unavailable: placed ghost blocks use a fully
  transparent texture, with player-specific particle outlines for visor wearers.
  Outlines refresh every five ticks, scanning loaded terrain once per second
  (or after moving over two blocks/changing dimension). Newly placed blocks can
  take one second to appear. Outlines expire within 0.26 seconds of visor removal;
  specter particles expire within 0.12 seconds. Both are depth-tested, not
  through-wall indicators. Normal targeting/selection outlines can still reveal
  a directly targeted block without a visor.
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
- [ ] Approach a specter with and without armor: it remains neutral. Damage it
      successfully and check attacker-only pursuit, cooldowns, last-attacker
      retargeting and continued retaliation after visor/armor removal.
      Test calming after death, disconnect, dimension/game-mode changes and
      escape beyond 20 blocks; nearby unprovoked specters must stay neutral.
- [ ] With boots alone, fall from height and check slow descent/no fall damage.
      Remove boots mid-fall over a safe landing, and test alongside existing
      Slow Falling potions. With chestplate alone, enter lava and fire, sneak
      and submerge; confirm burning stops and immunity ends on chestplate removal.
- [ ] Kill ordinary mobs with a spectral sword, including its last durability
      point. Check no conversion for players, armor stands, indirect kills or
      specters. Test both caps, different dimensions and `doMobSpawning false`.
      Observe idle/damage ectoplasm, cooldowns and unchanged death/vanilla loot.
- [ ] Two clients: placed ghost blocks are invisible without a visor and outlined
      only for the wearer within eight blocks, nearest 32 only. Test visor removal,
      placing/breaking, chunk boundaries, dimension changes and visible item icons.
- [ ] Place `/give @s ghosts:ghost_block` over a safe floor; test boot-only
      collision on every face, sliding, standing, edges, jumps, sneaking,
      boot removal, obstructions, latency, and landing after falls.
      A player without boots passes through.
- [ ] With full armor, sneak into a column of ghost blocks; test jump-to-climb,
      sneak-to-descend, holding position, leaving the column and removing armor.
      Verify ordinary blocks remain solid.
- [ ] Hover above solid ground, slabs, still/flowing water and lava; test jumps,
      low ceilings, edges, voids, swimming, sneaking, armor removal and reconnects.
      Confirm hover support needs a full set, while lava immunity needs only
      the chestplate.
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

For **0.3.0**, an isolated native world verified the replacement block item,
filtered loaded-block scans, six-face outline emission and removal, living-mob
eligibility (including fish), inanimate exclusions, and same-tick lethal
damage/death ordering. Lethal before-events can already report zero health;
the simulator covers that behavior and sword-break attribution.

For **0.4.0**, isolated native actor proxies confirmed reduced descent under
Slow Falling, extinguishing, neutral idling, provoked pursuit/melee and calming
after target loss.

Headless tests cannot certify rendering, native movement prediction, item wear,
or AI behavior in a connected Bedrock client. The checklist is a release gate.
