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

The manager separates **Worlds**, **Plugins**, **Users**, and **Logs** into
keyboard-accessible tabs. Server status and controls remain visible in every
tab, and switching tabs preserves unsaved forms and plugin filters.

**Logs** displays Bedrock stdout/stderr from `logs/bedrock.log`, polling
`/api/mbs/logs` every two seconds only while the tab is open and not paused.
Use **Pause logs** to inspect output and disable **Auto-scroll** to read earlier
lines. Each refresh reads at most the latest 64 KiB (the first line may be
partial); full history remains on disk. File replacement/truncation is picked
up on the next refresh. Missing logs are shown explicitly, and read/network
failures show an error with a retry action. Like the other APIs, this endpoint
must be protected by the deployment's authentication proxy.

The dashboard shows server process status, the selected world, and world-specific
pack selections. Status refreshes every 10 seconds. Start, stop, restart, world
switches, and pack changes show progress and errors without reloading the page.
Disruptive actions ask for confirmation: connected players are disconnected when
the server stops or restarts. A running process can still be loading its world.

The plugin list groups packs with exactly matching manifest names into one card,
with separate behaviour/resource activation buttons. Groups with any active
version appear first, alphabetically within active and inactive groups.
Uncheck **Show inactive plugins** to hide wholly inactive groups; inactive
companion packs and alternative versions of active groups remain available.
The filter persists during dashboard refreshes/world switches, not page reloads.

### Plugin updates and imports

The **Plugins** tab includes **Link source**, **Check for updates**, and archive
import. Link a CurseForge Bedrock project or GitHub repository to its installed
pack UUIDs. Select all behaviour/resource companions from the same project, even
when their names differ. Each UUID can belong to only one source. Other websites
are supported through manual download/import, not automated scraping.

For CurseForge, enter the numeric **project ID** shown on the project page.
Automatic checks require an approved key from
[CurseForge's API application](https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api).
Set `CURSEFORGE_API_KEY` in the server's ignored `.env` file and restart the
manager. The key stays server-side; never enter it in the dashboard or commit it.
Without a key, source links and manual imports still work. Author distribution
restrictions or unavailable download URLs produce a manual-download fallback.
API access to the selected Bedrock projects must be available to your key.

GitHub uses the latest non-prerelease release. If it contains multiple supported
archives, specify an exact asset filename in **Edit source**, or download and
import the correct archive manually. CurseForge selects the newest available
stable archive from the latest 50 files, optionally filtered by exact filename.
This is not a guarantee of Minecraft compatibility.

Tracking uses upstream **release IDs**, not manifest versions: a CurseForge file
ID or GitHub tag. When linking an existing installation, enter the release only
if known. Otherwise checks explicitly report that the installed release is
unknown and offer **Inspect latest release**, rather than claim an update exists.
Different release IDs are reported for review; manifest downgrades are blocked.
An associated manual import can record its known release ID. Unassociated imports
that change linked packs clear their release tracking to avoid false "current"
results.

**Update** downloads and inspects an archive, then shows the affected UUIDs,
versions, active selections, and warnings. It does not stop Minecraft until
**Install packs** is confirmed. Supported imports are ZIP, `.mcpack`, and
`.mcaddon`, including nested pack archives. The importer finds manifests instead
of relying on folder names. It refuses ambiguous versions/UUIDs, mixed pack
types, unsafe paths/links, invalid manifests, missing script entries, unsatisfied
pack dependencies, declared engine-version mismatches, and manifest downgrades.
Linked updates must contain exactly their selected pack UUIDs; adjust companion
selections or use a separate import for bundles that change their contents.

Limits are 64 MiB per upload/download, 256 MiB cumulative expanded data, 10,000
archive entries, 32 packs, and three nested archive levels. ZIP entry checksums
are checked; GitHub SHA-256 asset digests are checked when provided. Extracted
JavaScript is not executed by the manager, but will run inside Minecraft when
activated. Only install trusted packs. Script API versions, experimental
toggles, behavior changes, and actual in-game compatibility need manual review.

Installation shares the dashboard's server/world mutation lock. It backs up
affected existing files and world pack lists, stops a running Minecraft process,
rechecks the preview against configuration changes, installs, and restores the
previous running state. New/inactive packs remain inactive. Updated active packs
switch to the new version in the selected world. Other worlds retain their
selections and older installed versions are retained. Replacing files with the
**same manifest version** affects every world using that version; the preview and
confirmation warn about this.

Failures attempt to restore previous packs, selections, and running state.
Recovery failures are shown explicitly with a backup location. As with world
switches, externally changed server configuration leaves Minecraft stopped.
Do not run CLI deploy/update commands or another manager during installation.
Take independent world backups: these installation backups do not include world
databases or undo gameplay changes.

Source links persist in `bedrock/.mbs-plugin-sources.json`. Previews and retained
backups live under `bedrock/.mbs-plugin-updates/`; both are ignored by Git.
Previews expire after one hour, with at most five staged per manager process.
Cancelled/consumed previews are removed; expired ones are removed on the next
preview operation. Manager restarts invalidate preview tokens, so re-inspect
before installing. Orphaned staging directories after a restart and retained
backups need manual cleanup while no installation is running. Each backup has a
`receipt.json` mapping saved pack directories and metadata to their original
relative paths. Restore only with Minecraft stopped. Include source links and
important backups in your private runtime backups.

The API supports `/api/plugins/updates` and proxy-stripped equivalents:
`GET /plugins/updates`, source `POST/PUT/DELETE /plugins/updates/sources[/<id>]`,
`POST /plugins/updates/check`, `POST /plugins/updates/sources/<id>/stage`
(`{ releaseId }`), `POST /plugins/updates/import` (raw archive bytes with
`application/octet-stream`, optional `sourceId`/`releaseId` query parameters),
`DELETE /plugins/updates/stages/<token>`, and
`POST /plugins/updates/stages/<token>/install` (`{ confirmed: true }`).
Protect these administrative endpoints with the same authentication proxy as
the rest of the manager; the API itself remains unauthenticated.

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

### Minecraft users and world permissions

The **Users** panel discovers XUIDs from `bedrock/permissions.json`, the allowlist,
saved world assignments, and `logs/bedrock.log`. The dashboard refreshes discovery
every 10 seconds while open; reopening it also imports players seen since the last
visit. Connection logs include usernames alongside XUIDs, so no external Xbox
lookup or credentials are needed. Unknown usernames remain visible by XUID.
Editable aliases are independent of discovered names, survive name changes, and
can be cleared. **Add user** also accepts an XUID before that player connects.

Select any world in the Users panel to assign **visitor**, **member**, or
**operator**, or **Server default** to remove an explicit assignment. Unassigned
players inherit `default-player-permission-level` (Bedrock defaults to member).
These are Minecraft permissions, not web-manager access or an allowlist:
operator permits administrative game commands; visitor does not block joining.
Existing `permissions.json` assignments are imported into the initially selected
world only. Other existing and new worlds start without explicit assignments.

Bedrock's `permissions.json` is server-wide, so the manager stores inactive-world
assignments in each world's `.mbs-permissions.json` and applies the selected
world's assignments during a switch. Active-world saves update `permissions.json`
without stopping Minecraft; use **Restart server** to apply them to the running
server. A failed world switch attempts to restore both configuration and the
previous permissions. Switching away saves the current assignments, including
manual edits to `permissions.json`. Do not manually change `level-name` or operate
another manager during a switch; CLI world changes bypass this coordination.

Aliases and discovered identities persist in `bedrock/.mbs-users.json`. Both the
registry and world permission files are private runtime state, ignored by Git and
preserved by updates. Include them in backups. The API exposes `GET /api/users`
and `PUT /api/users` (also available without `/api`); updates accept
`{ xuid, alias, world, permission }`, where XUID stays a string and permission is
one of the three roles or `null` for the server default. Protect these endpoints
with the same reverse-proxy authentication as the rest of the manager.

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
node --test tests/plugin-updates.test.ts
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

### Fart

`plugins/fart/` contains behavior and resource packs both named **Fart**, grouped
into one card in the manager. The behavior pack adds
an edible **Tin of Beans** (`mbs:tin_of_beans`), crafted at a crafting table from
one iron nugget and two beetroots. Eating it, even at full hunger, enables
damage- and jump-triggered farts for 60 seconds; another tin resets the timer.
Beans also grant Regeneration II for 5 seconds and Absorption I (two temporary
hearts) for 2 minutes, like a regular golden apple. Stronger or longer
same-strength existing health effects are preserved; eating another tin refreshes
shorter effects rather than stacking them. Players
with Poison or Hunger also qualify. Vanilla rotten flesh causes Hunger, not
Poison, so its food effect is included. Healthy, bean-free players do not fart.

Positive, nonfatal damage emits vanilla smoke behind the player's waist and
plays a recorded positional fart sound, audible to nearby players. Each size
has three distinct excerpts from CC0 recordings; Bedrock
randomly selects one per fart, with repeats possible. Volume is doubled:

| Damage (health points; 2 = one heart) | Sound/cloud duration | Volume | Poison duration |
| ------------------------------------- | -------------------- | ------ | --------------- |
| Up to 2                               | 0.4 seconds          | 0.8    | 2 seconds       |
| Up to 4                               | 0.8 seconds          | 1.4    | 3 seconds       |
| Up to 8                               | 1.6 seconds          | 2.0    | 5 seconds       |
| Over 8                                | 3 seconds            | 3.0    | 7 seconds       |

Jumping while on beans or Poison emits the smallest fart, including its normal
poison cloud. Hunger alone still qualifies for damage farts but not jump farts.
Takeoff is checked every tick: holding jump does not repeat while airborne,
but a fresh takeoff after landing can fart again. Walking off ledges, flying,
gliding, and swimming do not trigger jump farts. Jump farts merge with active
damage bursts rather than interrupting a larger fart.

Clouds follow the player's position, facing, and dimension every four ticks.
Living entities within three blocks of the emission point receive Poison I,
including other players and pets, but never the emitting player. Existing poison
is not replaced or extended; immune mobs follow vanilla poison rules. Poison
does not kill on its own. Each entity is exposed at most once per burst.
The cloud's own poison ticks cannot trigger further farts, avoiding endless
chain reactions; other damage to those poisoned players still qualifies.
Overlapping hits merge into one burst: equal/weaker hits do not restart it,
while stronger hits upgrade it. Duration/volume are capped at the largest tier.
Death/respawn and leaving clear beans and active clouds; server restarts also
reset these temporary states. Poison status itself remains governed by Minecraft.

Build with `npm run plugins:build`. To install, run `npm run plugins:deploy`,
activate **both Behaviour and Resource buttons under Fart** for the desired world in the manager,
then restart Minecraft. The manager does not automatically activate dependencies.
Clients must accept/download the resource pack for the icon and audio.
No experimental features are required. With operator permissions and cheats,
use `/give @s mbs:tin_of_beans` for testing.

Check in-game: eat beans, take small then large hits, and have a second player
watch/listen from behind and stand in the cloud. Check poison on nearby mobs,
self-exclusion, bean expiry, rotten-flesh Hunger, normal Poison, health benefits,
jumps (including holding jump and landing), sound variety, respawn, and
dimension changes. Automated tests cover the mocked Script API, pack assets,
and build output; actual Bedrock item consumption, rendering, and audio still
need this in-game verification. This pack has not been activated on the live world.

The sounds are CC0 recordings from Freesound:
[Farts, loud and flabby x7 by peridactyloptrix](https://freesound.org/people/peridactyloptrix/sounds/202528/),
[2 Part Fart by DSISStudios](https://freesound.org/people/DSISStudios/sounds/640804/), and
[Morning fart by frenkfurth](https://freesound.org/people/frenkfurth/sounds/777448/).
Source credits, verified license, download links, checksums, and excerpt timing
are in `plugins/fart/resource/sounds/credits.json`, also shipped in the resource
pack. High-quality MP3 previews are preserved under `plugins/fart/audio-sources/`
for offline conversion; Freesound's original WAV downloads require login.
Excerpts are mixed to mono, peak-normalized with headroom, and edge-faded,
without synthesis, looping, or pitch changes. Longer variants use different
windows of the same long recording. The 16x16 beans icon remains original.

Bedrock custom sounds use Ogg Vorbis (`.ogg`), not merely an Ogg file containing
Opus. Mono provides positional audio; these clips retain the recordings' 48 kHz
sample rate (24 kHz is not required). To rebuild the audio and icon, run
`python3 plugins/fart/generate-assets.py` (Python 3 and system `libsndfile` with
MP3 decoding and Ogg Vorbis encoding are required only for regeneration, not
build/deployment). The script verifies bundled source checksums and never
downloads audio or overwrites sources.

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
