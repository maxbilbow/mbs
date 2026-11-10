# Wayworks

**Workers that build your world and connect its neighbourhoods.**

Version **0.1.0**, an initial playable prototype. The name combines road/rail
"ways" with public works. This README is the development plan and feature log.

## Agreed first version

- [x] A custom, persistent worker entity with an owner and 27 supply slots.
- [x] Straight, level roads and railways: choose direction, width and length.
- [x] Survival material costs; free construction in the owner's creative mode.
- [x] Replace explicitly allowlisted natural terrain and clear headroom.
- [x] Craftable special bus-stop blocks, named routes and ordered stops.
- [x] Assign workers to loop between stops; **no passengers or bus vehicle yet**.
- [x] Save jobs, progress, pauses and routes with Bedrock dynamic properties.
- [x] Original public-domain textures and worker model.
- [x] Automated model, pack wiring and simulated Script API tests.
- [ ] Complete the in-game acceptance checklist below before treating this as
      production-ready.

## Install

Requires Bedrock **1.21.100+** and stable `@minecraft/server` **2.0.0** /
`@minecraft/server-ui` **2.0.0**. No preview APIs or experimental toggles are
intentionally required. Both behavior and resource packs are named **Wayworks**.

From the repository root:

```sh
npm run plugins:build
```

Output: `.build/plugins/wayworks/behavior/` and
`.build/plugins/wayworks/resource/`. When ready to install:

```sh
npm run plugins:deploy
```

These commands process **all** source plugins. Deploy copies files only; activate
**both Wayworks packs** for the chosen world in the web manager, then restart
Minecraft separately. Back up the world and try a disposable test world first.
No deployment, activation or live-server restart is part of development/testing.

## Getting started

### Planner and workers

1. Craft a **Wayworks Planner**: one paper + one iron ingot (shapeless).
2. Use the planner **on an ordinary block** to open its menu. Air-use events are
   also handled when emitted by the client.
3. Choose **Recruit worker**. Survival costs **4 iron ingots**; creative is free.
   The worker appears at your feet, so stand on a clear, full-height block.
4. Interact with your worker, or select a nearby owned worker in the planner.
   Management requires staying within 16 blocks.
5. **Load all construction supplies** transfers supported materials from your
   inventory into the worker. **Return supplies** transfers them back, leaving
   anything that will not fit with the worker.

Workers accept cobblestone, stone bricks, black concrete and regular rails.
Only the recruiting player can manage them. They have health and may die; return
valuable supplies before putting them at risk. Dismissing requires an empty,
idle worker and does not refund recruitment iron.

Recruit workers through the planner, not `/summon`: manually summoned workers
have no owner and cannot be managed.

### Roads and railways

Choose **Build road / railway** in the worker menu:

- Direction: north (-Z), east (+X), south (+Z) or west (-X).
- Width: **1-9 blocks**; railway width means that many parallel tracks.
- Length: **1-128 rows**, including the initial row under the worker.
- Surface/foundation: cobblestone, stone bricks or black concrete.

The road surface is the full block immediately below the worker's feet when
the job starts. Construction stays at this height. Width is centred on the
worker for odd widths; even widths include one extra lane to the right of the
chosen direction. Three blocks above the surface are cleared. Railway jobs put
ordinary, straight rails in the first of those blocks, leaving two blocks above
the rails clear.

A road costs up to `width * length` surface blocks; a railway additionally costs
that many rails. Existing matching blocks cost nothing. The worker checks the
**whole next row**, including resources, before modifying it. It then builds one
row per half-second and steps onto it. At most 16 active workers are serviced
per interval, rotating fairly when there are more.

Construction is free only while the owner is currently in creative mode; changing
back to survival requires supplies for subsequent rows. Work waits while the owner
is offline, in another dimension, in adventure/spectator mode, or the worker is
unloaded. An unloaded target chunk, missing supplies or obstacle pauses the job
with a message. Load supplies or fix the obstruction, then **Pause / resume job**.
**Cancel job** keeps blocks already placed and unused supplies.

**Warning: excavation has no drops and no undo.** The allowlist in
[`behavior/scripts/model.ts`](behavior/scripts/model.ts) includes ordinary soil,
stone, sand, gravel, mud, snow and selected small plants. It does not include
ores, logs, leaves, liquids, bedrock, containers, bus stops or most building blocks.
The API cannot distinguish naturally generated stone/dirt from player-placed
stone/dirt: **structures built from allowlisted blocks can be removed**.
Gravity-driven terrain changes can also occur after excavation. Survey the area
and back up important worlds.

Rails are **unpowered**: this version does not build powered rails, signals,
slopes, curves, switches, road markings or bridge supports. Single-track width
is recommended for initial in-game testing, since vanilla rail neighbour updates
may affect adjacent parallel tracks.

### Bus stops and routes

Craft a **Wayworks Bus Stop** at a crafting table:

```text
 Y      Y = yellow dye
 I      I = iron ingot
SSS     S = cobblestone
```

1. Place two or more stops **flush with a level path's surface**, not on top of
   it. Workers stand on the stop block, so remove one surface block and place the
   stop in that gap.
2. Interact with each stop. Give them the same case-sensitive route name and
   distinct stop numbers, for example `Town Loop`: 1, 2, 3.
3. Interact with a worker, choose **Assign bus route**, then choose the route.
   Cancel any existing construction or route job first.

Names use 1-32 ASCII letters/numbers/spaces/hyphens/underscores and start with a
letter or number. Routes are private to the player who placed the stops and
separate per dimension. Stops are sorted by number; gaps in numbering are fine.
There is a world-wide limit of **128 registered stops**. A blank name unassigns
a stop. Breaking a stop normally removes its registration. Stops cannot be
piston-moved or exploded.

Workers move in short collision-checked steps, about one block per second,
following **straight segments** between stops, dwell about five seconds, then
loop from the last stop to the first. All stops must be at the same height.
Start the worker on the same level. Provide clear headroom and continuous
full-block support using the construction surfaces or allowlisted solid natural
blocks. This is **not pathfinding**: workers do not follow road bends or climb
obstacles. Add intermediate stops at corners.

Missing/unloaded stops, blocked movement and unsupported ground pause a route;
fix the path and resume. Place all stops within loaded chunks for this prototype.
Only the owner can change a stop's route, but ordinary world permissions still
govern who can physically break it. Administrative `/fill` or external edits do
not emit player-break events: replace and normally break affected stops to clear
stale registrations.

**These are bus-route demonstrations, not passenger transport.** Workers do not
board players, spawn buses, charge fares or carry passengers.

## Bedrock design and future plan

The behavior pack defines the worker, planner, recipes and stop block. The
resource pack supplies the original model and textures. Server scripts provide
forms, inventory transfer, placement and route stepping. There are no commands
executed on behalf of players and no changes to the manager or pack activation
flow.

Worker ownership, job progress and pause reasons are entity dynamic properties;
stop records are world dynamic properties. Chunk unload/reload and normal world
saves preserve them. Unexpected failures are logged and pause the affected
worker. Failed placements refund the current item's charge; an already completed
part of a row is retained and skipped on retry. This is not a transactional world
editor or a crash-safe undo system. Preserve the manifest UUIDs in later releases
so saved state remains associated with these packs.

Next milestones, in order:

1. **Playtest and polish:** verify pack loading/rendering, touch/controller forms,
   resource recovery on worker death, multiplayer, rail neighbour updates and
   real save/restart behaviour. Add a construction preview/explicit confirmation.
2. **Better civil engineering:** excavation salvage, optional terrain policies,
   powered rail spacing, road markings, connected segments, slopes and bridge
   supports. Design permissions/claim integration before public-server use.
3. **Route navigation:** independent waypoints (not every corner needs a stop),
   path validation/preview, route editor/deletion and safer stale-stop cleanup.
4. **Passenger buses:** prototype a custom rideable entity using `minecraft:rideable`.
   Validate boarding, collision, dismount safety and loaded-chunk limits before
   choosing teleport-stepping versus actual movement/navigation. Do not promise
   cross-dimension or unloaded-chunk travel.
5. **Worker presentation:** walking animations, distinct driver/construction roles,
   and optional original/verified-CC0 sound effects.

## Development and verification

```sh
npm run plugins:typecheck
node --test tests/wayworks.test.ts tests/plugins.test.ts
npm run plugins:build
npx prettier --check plugins/wayworks tests/wayworks.test.ts tests/fixtures/wayworks-api.ts
```

Pure planning/state validation lives in
[`model.ts`](behavior/scripts/model.ts); Bedrock integration lives in
[`main.ts`](behavior/scripts/main.ts). Tests use a deliberately small simulator,
not the Bedrock engine. They do not prove JSON schema acceptance, client rendering,
actual physics/rail updates or real persistence.

### In-game acceptance checklist (not yet run)

- [ ] Activate both packs on a disposable world; no content-log errors.
- [ ] Planner works on mouse, controller and touch; worker and stop render.
- [ ] Craft both items, recruit with exactly four iron, reject insufficient iron.
- [ ] Build all four directions at widths 1, 2, 3 and 9; verify length and clearance.
- [ ] Rails load and align correctly, especially adjacent tracks.
- [ ] Creative is free; changing to survival spends actual supplies.
- [ ] An obstacle or empty inventory pauses without changing the next row.
- [ ] Supply transfer/return handles full inventories without loss or duplication.
- [ ] A second player cannot command another player's worker or configure their stop.
- [ ] Stop numbering, dwell/loop behaviour, obstruction and removal work.
- [ ] Save/restart and chunk unload/reload preserve jobs and stops.
- [ ] Worker death drops/recovery behave as expected; idle empty dismissal is safe.

## Assets and licensing

All three pixel-art textures and the worker geometry are original work dedicated
to the public domain under **[CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/)**.
No downloaded assets or custom sounds are used. Minecraft's built-in geometry
and rendering materials are referenced, not copied or relicensed.
[`resource/CREDITS.txt`](resource/CREDITS.txt) ships with the pack.

Regenerate textures deterministically from the repository root using Node 24+:

```sh
node plugins/wayworks/generate-assets.ts
```

The generator uses only Node's built-in PNG encoding primitives; no new
dependencies are required.

API references used for this prototype:

- [Stable Script API](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/minecraft-server)
- [Server forms](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-ui/minecraft-server-ui)
- [Entity inventory](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitycomponents/minecraftcomponent_inventory)
- [Block material instances](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_material_instances)
- [Immovable blocks](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_movable)
