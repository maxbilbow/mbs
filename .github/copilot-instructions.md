# Copilot Instructions

## Build, test, and lint

- `npm run build` bundles `App/client/main.tsx` and `auth.ts` into `App/www/js`.
- `npm start` (via `scripts/manager.ts`) builds the client, syncs `App/www/` to `CADDY_OUTPUT_PATH` if set, then restarts the Express API detached on port 8081 (logs in `logs/web-api.log`). `npm stop` stops it; `npm run serve` runs it in the foreground.
- `npm test` runs Node's test runner against `tests/*.test.ts`; run one file with `node --test tests/plugins.test.ts` or one test with `node --test --test-name-pattern="pack activation" tests/plugins.test.ts`. Fixtures isolate tests from the live runtime.
- `npm run typecheck` checks the server, client, and Max plugin without emitting files.
- There is no lint script. Format-check changed files with `npx prettier --check <files>`.
- TypeScript configs extend the root configuration and are split across the application and `plugins/max/`. Node.js 24+ runs server/scripts TypeScript directly.

## Architecture

- `App/server/app.ts` constructs the testable Express app; `start.ts` only listens on 8081; deployment lives in `scripts/manager.ts`. Direct `/api` routes and legacy proxy-stripped routes are supported.
- `bedrock/` is the live Minecraft installation; shared paths and process control live in `scripts/`. Preserve its working directory and the root launch/update compatibility wrappers.
- The plugin API delegates discovery and activation to `App/server/data/Plugins.ts`. It scans manifests under `bedrock/development_*_packs/` and reads the active world from `bedrock/server.properties`. Keep pack state changes in this server data/API flow.
- The browser client is bundled from `App/client/main.tsx`. React UI components and custom elements are initialized through `App/client/elements/main.ts`; browser API calls are grouped under `App/client/api/`.
- Shared plugin and metadata types are in `App/model/` and are consumed by both client and server code.
- Edit Max's pack in `plugins/max/behavior/`, not its deployed runtime copy. `npm run plugins:build` builds it; `npm run plugins:deploy` builds and deploys without activating or restarting Minecraft. Preserve UUIDs.
- See [README.md](../README.md) for runtime/update commands, deployment, cron setup, and known issues. Updates commit only tracked runtime files affected by the archive and never push.

## Conventions

- Use the native ES module import style already used in each area: server TypeScript imports use `.ts` extensions; client TypeScript imports commonly use `.js` extensions.
- Client API functions return `[data, error]` tuples; follow that contract for new calls and preserve it when updating callers.
- Plugin kinds use the string literals `"behaviour"` and `"resource"` throughout the shared model and API; keep them consistent.
