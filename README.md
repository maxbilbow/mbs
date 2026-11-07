# MBS

A private Minecraft Bedrock dedicated server, a web-based server/pack manager,
and TypeScript Minecraft plugin sources.

## Repository layout

- `bedrock/` is the live Minecraft installation: executable, server configuration,
  worlds, vendor packs, and deployed development packs. Its working directory is
  significant; do not run the executable from the repository root.
- `App/` contains the Express API, React dashboard, and shared models.
- `plugins/` contains editable TypeScript packs and shared type-checking configuration.
  `plugins/example/behavior/` is a minimal, verifiable example.
- `scripts/` contains runtime control, the updater, plugin build/deployment, and
  shared paths. Root `mbs`, `update-server.ts`, and `update-server.sh` remain
  compatibility entry points.

World databases, the server executable, downloaded vanilla assets, logs, and
generated bundles are not versioned. A fresh clone is not a complete Minecraft
installation: install the Linux Bedrock distribution into `bedrock/` and restore
your private world/configuration backups before starting it.

## Requirements

- Linux and Node.js 24 or newer (TypeScript runs directly in Node).
- npm, Git, `unzip`, and `pgrep` (procps). Scheduled updates also use `flock`.
- `rsync` if publishing the UI through `CADDY_OUTPUT_PATH`.
- A compatible Bedrock client/server and the operating-system libraries required
  by the installed Bedrock release.

Install the application's dependencies with `npm ci`. Keep local application
environment settings in `.env`; the application currently uses
`CADDY_OUTPUT_PATH` for optional static-file publishing.

## Run Minecraft

```sh
npm run bedrock -- status
npm run bedrock -- start
npm run bedrock -- stop
npm run bedrock -- restart
```

The equivalent compatibility commands are `./mbs start`, `./mbs stop`,
`./mbs restart`, and `./mbs status`. Commands target this installation's
executable, not every process named `bedrock_server`. Stop sends SIGINT and waits
for shutdown before a restart or update; startup output goes to
`logs/bedrock.log`.

Configure the server in `bedrock/server.properties`. Worlds are under
`bedrock/worlds/`; the plugin manager follows the configured `level-name`.
The web manager can select and create worlds; it follows the configured world
without restarting the API. Manual world-name changes still require a Minecraft
restart.
Do not edit world pack lists while another tool or Minecraft is writing them.
Take world/configuration backups before updates: Git does not back up worlds.

## Update Minecraft

```sh
npm run bedrock:update -- --check  # release lookup only; no changes
npm run bedrock:update            # download, install, restart, runtime-only commit
./update-server.sh               # cron wrapper; output in logs/update-server.log
```

The updater looks up Linux releases using
[bedrock-server-downloads](https://github.com/kittizz/bedrock-server-downloads).
It downloads and checks the archive before stopping Minecraft, overlays files
inside `bedrock/`, and preserves `server.properties`, permissions, allowlist,
worlds, `config/`, and development behavior/resource/skin packs.

Automatic commits contain only already-tracked files overwritten by that
update, plus `bedrock/current_version.txt`. Unrelated staged or unstaged
development changes are not included, and the updater never pushes. Updates
refuse to overwrite locally modified tracked update files. Commit the initial
repository migration before the next actual update so the new runtime paths
are tracked.

The existing local cron entry was migrated without changing its 03:00 schedule.
For another installation, use an absolute wrapper path and provide a PATH
containing Node.js 24, for example:

```cron
0 3 * * * PATH=/path/to/node/bin:/usr/local/bin:/usr/bin:/bin /path/to/mbs/update-server.sh
```

The wrapper prevents overlapping scheduled runs with `flock`. Do not run a
manual update or restart concurrently with a scheduled update.

## Run the web application

```sh
npm start   # build, publish, then (re)start the manager in the background
npm stop    # stop the manager
npm run manager status
```

`npm start` builds the UI and publishes it (see below) before stopping any
existing manager from this checkout and starting a new one. A failed build leaves
the current manager running. The manager runs detached, logs to
`logs/web-api.log`, and `npm start` waits until it responds on port 8081.
Use `npm run serve` to run it in the foreground without building.

Open `http://localhost:8081`. Express serves `App/www/` and the API under `/api`.
Legacy unprefixed routes remain available for proxies that strip `/api`.
Starting the API does not start Minecraft.
The build produces minified production React bundles, without a framework or
deployment migration.

If `CADDY_OUTPUT_PATH` is set, `npm start` also runs `rsync --delete` from
`App/www/` to that destination. Use a dedicated static-output directory:
files there that are absent from `App/www/` will be deleted.

The home-server deployment in `../repos/home-server/` protects
`https://mbs.maxbilbow.com` with Caddy forward authentication. Authentik has an
`mbs` application, a single-application forward-auth provider for that hostname,
and an enabled **MBS administrators only** policy. The provider is assigned to
the embedded outpost, whose Authentik URL is `https://auth.maxbilbow.com`.
These objects live in Authentik's PostgreSQL volume, not in the Compose file.

Caddy must forward `/outpost.goauthentik.io/*` to Authentik before its auth check;
all other UI/API requests require authentication. The API on port 8081 itself
remains unauthenticated: firewall access to that port so external clients cannot
bypass Caddy. The manager is started manually and does not automatically
resume after a host reboot.

### Dashboard and worlds

The dashboard shows server process status, the selected world, and world-specific
pack selections. Status refreshes every 10 seconds. Start, stop, restart, world
switches, and pack changes show progress and errors without reloading the page.
Disruptive actions ask for confirmation: connected players are disconnected when
the server stops or restarts. A running process can still be loading its world.

Choose **Switch world** to activate an existing world. If Minecraft is running,
the manager waits for it to stop, changes the configuration, and starts it again.
If it is already stopped, it stays stopped; use **Start server** when ready.
Selecting the current world does nothing.

**New world** accepts a unique name, an optional seed, game mode, and difficulty.
Leave the seed blank for random generation; large numeric seeds are kept as
strings. **Create world** saves a pending world for later. Check **Select this
world after creation** to activate it immediately, using the same running/stopped
behavior as switching. Bedrock generates the actual world on its first start
while selected. **Pending generation** remains visible until a world database
exists; the manager does not fabricate databases or copy another world's packs.

The manager saves versioned settings in each world's `.mbs-world.json`. Switching
away saves that world's current configured seed/game mode/difficulty; returning
restores saved settings. Previously unmanaged worlds use the current server
defaults on first selection. These are server configuration values, not an
inspection or rewrite of an existing world's database: a seed does not regenerate
an existing world, and existing player modes still follow Bedrock's
`force-gamemode` semantics. Unrelated properties, comments, and world pack lists
are preserved. The updater already preserves the entire `worlds/` directory.

Concurrent manager mutations receive a conflict error instead of overlapping.
This gate covers this API process only: do not run CLI start/stop/restart commands,
another API instance, configuration edits, or scheduled updates during a manager
operation. Do not edit pack lists while Minecraft or another tool is writing them.

If a switch fails before shutdown completes, the configuration is not changed.
Later failures trigger an attempt to restore the previous configuration and
running state. Recovery failures are explicit; check dashboard status,
`server.properties`, and `logs/bedrock.log` before retrying. If a new world was
saved but activation failed, its pending directory is retained. Take backups
before important changes: there is no world deletion, import, or backup UI.
If configuration changes externally during shutdown, the manager refuses to
overwrite it and leaves Minecraft stopped rather than starting an unexpected
world.

`App/server/app.ts` creates the Express app independently of the listening
process and accepts injected pack/world/process services for tests.
`App/server/data/Plugins.ts` discovers manifests, groups versions by UUID, and
persists activation to the configured world's pack lists. One version per pack
UUID is active. The client calls the API through `[data, error]` result tuples. World management
uses `GET /api/worlds`, `POST /api/worlds` (name, seed, gameMode, difficulty,
activate), and `POST /api/worlds/activate` (name); proxy-stripped routes work too.

## Test and check

```sh
npm test
node --test tests/plugins.test.ts
node --test tests/worlds.test.ts tests/plugins.test.ts
node --test --test-name-pattern="pack activation" tests/plugins.test.ts
npm run typecheck
npm run build
npx prettier --check App/server/app.ts scripts/plugins.ts README.md
```

Tests use temporary Minecraft installations, injected process controls, and a
temporary Git repository. They do not stop the live server, alter live worlds,
or push commits. Minecraft Script API behavior itself needs an in-game check.

## Develop and deploy TypeScript plugins

Edit `plugins/example/behavior/manifest.json` and
`plugins/example/behavior/scripts/main.ts`, then:

```sh
npm run plugins:typecheck # checks all source plugins without emitting files
npm run plugins:build     # checks and bundles into .build/plugins/<name>/<kind>/
npm run plugins:deploy    # checks, builds, and copies packs into Bedrock
```

The commands discover all `plugins/<name>/behavior/` and optional
`plugins/<name>/resource/` directories. Each pack needs a `manifest.json`.
Behavior packs deploy to `bedrock/development_behavior_packs/<name>/`; resource
packs deploy to `bedrock/development_resource_packs/<name>/`. Resource-only and
data-only packs copy assets without compiling scripts.

Script manifests still declare JavaScript: an entry such as `scripts/main.js`
is built from `scripts/main.ts`. Local TypeScript imports are bundled, and
`@minecraft/*` imports remain external so Minecraft supplies the Script API.
All declared script entries are built. Manifests and runtime assets are copied;
TypeScript files and `tsconfig*.json` files are excluded. Build output and owned
deployment folders are replaced on subsequent runs so stale scripts are removed.

To add a plugin, copy the example into a new `plugins/<name>/behavior/` folder
and assign fresh header and module UUIDs. Keep each pack's header/module versions
consistent and use a Script API dependency supported by the installed Minecraft
release. The example uses stable `@minecraft/server` API `2.0.0` and requires
Bedrock `1.21.90` or newer. All source plugins share `plugins/tsconfig.json`.
Build/deploy commands stop on TypeScript errors. Deployment preserves manifest
UUIDs and preflights every destination, refusing to replace a different pack or
a directory without a readable manifest.

Deployment does not activate the pack, change the active world, or restart the
server. In the web manager, activate **TypeScript example** for the configured
world, then restart Minecraft and join:

Behavior activation must write `worlds/<world>/world_behavior_packs.json`
(American spelling), even though the API kind is `"behaviour"`. Earlier manager
versions wrote `world_behaviour_packs.json`, which Bedrock ignores. If you
activated packs with those versions, restart the management API with `npm start`
and activate the desired packs again before restarting Minecraft. The old file
is not treated as active state or migrated automatically, since it may contain
packs you do not want loaded. Startup logs should list the example in the pack
stack rather than `Pack Stack - None`.

1. On world startup the pack broadcasts
   `[TypeScript example] Loaded. Run /scriptevent example:ping`. You may miss this
   message if you join after startup.
2. With cheats enabled and operator/command permissions, run
   `/scriptevent example:ping`. Expect
   `[TypeScript example] Pong! TypeScript is running.`

The example replaces the non-working Max source pack, not its installed copy.
It has fresh UUIDs and deploys to `example/`; any old `__Max` packs remain
untouched. Deactivate the old **Max chat commands** pack through the web manager
if it is still active. If no pong appears, check the Bedrock content log for
script or dependency errors and confirm the example is active in the correct
world. Automated tests verify compilation and mocked event callbacks; an actual
in-game check is still required after deployment.

Deployed packs are runtime copies; edit and commit the source under `plugins/`,
not the generated packs.

### Creative Aura

`plugins/creative-aura/behavior/` contains **Creative Aura**, authored by
**Max Bilbow**. It emits a rotating ring of six vanilla end-rod sparkles around
each creative player every 10 ticks (about half a second). It checks the player's
actual game mode, so personal `/gamemode` overrides take precedence over the
world default. Joining, respawning, and dimension changes are picked up on the
next check. Survival, adventure, and spectator players receive no aura.

Run `npm run plugins:deploy`, activate **Creative Aura** for the desired world
in the web manager, and restart Minecraft. No resource pack is needed. This is
a particle effect, not a through-wall outline or a source of world lighting.
Existing sparkles fade over roughly 3-4 seconds after leaving creative mode;
moving players may leave a short sparkle trail.

Verify in-game with two players: watch a creative player's aura, switch that
player to survival and back, then check respawning and travel between dimensions.
Also test a creative-default world with a player explicitly in survival.
Automated tests use a mocked Script API; actual multiplayer rendering still
requires this in-game check.

The pack selector displays authors from each manifest's `metadata.authors`
string array, combining distinct authors across installed versions. Add this
metadata to your own source manifests to make your packs recognizable. Packs
without author metadata show **Author not specified**.

Playwright MCP is configured in `.mcp.json` for browser inspection. Trust/start
it in your Copilot client when needed.

## Known issues and limitations

- **Minecraft transport:** the installed `1.26.62` server requires
  `transport=nethernet`, now configured and verified with a client connection.
  Connect on port **19132**; NetherNet uses `server-port` for TCP signaling and
  ignores the legacy IPv6 `server-portv6=19133`. Public access also needs
  reachable negotiated UDP gameplay traffic.
- **World/pack mismatch:** the API previously edited `Bedrock level`, but
  `server.properties` selects `Island Survival`. This is fixed in the API.
  Existing packs assigned to the old world were not automatically activated in
  the current world.
- **Access control:** this repository implements no API authentication.
  `login.html`/the login component reference `/api/auth/login`, which has no
  handler here. Keep the application behind trusted private access or an
  authenticating reverse proxy; CORS is not authentication.
- **Update recovery:** installation overlays files and has no automatic rollback
  or world backup. If copying or startup fails, the error is explicit; recover
  the executable/assets from a known-good distribution and restore backups as
  needed. Obsolete vendor files are not automatically deleted.
- **Pack handling:** manifests/world JSON are not comprehensively schema-checked,
  pack dependencies are not resolved automatically, and file writes are not
  coordinated with Minecraft. Invalid manifest data and simultaneous changes
  still need better handling.
- **Browser UI:** customized built-in button elements are not supported by every
  browser, and server-status/pack-state displays are not automatically refreshed
  after all actions. Fetch network exceptions do not currently follow the
  client's error-tuple contract.
- **Secrets and distribution:** `.env` was already tracked before being ignored;
  ignoring it does not remove it from Git/history. Review and remove sensitive
  values before sharing. Third-party addon assets remain versioned; review their
  licenses before redistributing this repository.
