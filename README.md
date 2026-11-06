# MBS

A private Minecraft Bedrock dedicated server, a web-based server/pack manager,
and Max's custom Minecraft plugin.

## Repository layout

- `bedrock/` is the live Minecraft installation: executable, server configuration,
  worlds, vendor packs, and deployed development packs. Its working directory is
  significant; do not run the executable from the repository root.
- `App/` contains the Express API, React/custom-element client, and shared models.
- `plugins/max/behavior/` is the editable source for Max's chat-command pack.
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
Restart both the Minecraft server and the API after changing the world name.
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
npm run build
npm start
```

Open `http://localhost:8081`. Express serves `App/www/` and the API under `/api`.
Legacy unprefixed routes remain available for proxies that strip `/api`.
Starting the API does not start Minecraft.

If `CADDY_OUTPUT_PATH` is set, startup first builds the UI and runs
`rsync --delete` to that destination. Use a dedicated static-output directory:
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
bypass Caddy. `npm start` is still manually managed and does not automatically
resume after a host reboot.

`App/server/app.ts` creates the Express app independently of the listening
process and accepts injected pack/process services for tests.
`App/server/data/Plugins.ts` discovers manifests, groups versions by UUID, and
persists activation to the configured world's pack lists. One version per pack
UUID is active. The client calls the API through `[data, error]` result tuples.

## Test and check

```sh
npm test
node --test tests/plugins.test.ts
node --test --test-name-pattern="pack activation" tests/plugins.test.ts
npm run typecheck
npm run build
npx prettier --check App/server/app.ts scripts/plugins.ts README.md
```

Tests use temporary Minecraft installations, injected process controls, and a
temporary Git repository. They do not stop the live server, alter live worlds,
or push commits. Minecraft Script API behavior itself needs an in-game check.

## Develop and deploy Max's plugin

Edit `plugins/max/behavior/manifest.json` and
`plugins/max/behavior/scripts/main.js`, then:

```sh
npm run plugins:build   # bundles into .build/plugins/max/behavior/
npm run plugins:deploy  # builds and copies into bedrock/development_behavior_packs/__Max/
```

`@minecraft/*` imports remain external so Minecraft supplies the Script API.
Deployment preserves the pack UUID and refuses to overwrite another pack's
UUID. Keep the header/module versions consistent and use a Script API dependency
version supported by the installed Minecraft release.

Deployment does not activate the pack, change the active world, or restart the
server. In the web manager, activate **Max chat commands** for the configured
world, then restart Minecraft. Use `/max:hello` in-game to verify it loaded.
The deployed pack is ignored by Git; edit and commit the source, not the runtime
copy.

Playwright MCP is configured in `.mcp.json` for browser inspection. Trust/start
it in your Copilot client when needed.

## Known issues and limitations

- **Current Minecraft connectivity:** the installed `1.26.62` server logs that
  `transport=raknet` prevents players from connecting and requests
  `transport=nethernet`. The migration preserved the existing setting; resolve
  the transport/client compatibility before expecting players to connect.
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
