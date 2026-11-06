# Copilot Instructions

## Build, test, and lint

- `npm run build` bundles `App/client/main.tsx` into `App/www/js`.
- `npm start` runs the Express API on port 8081. If `CADDY_OUTPUT_PATH` is set, startup also bundles the client (including `auth.ts`) and syncs `App/www/` to that path.
- There is no configured test runner or test suite, so there is no single-test command.
- There is no lint script. Format-check changed files with `npx prettier --check <files>`.
- TypeScript configs are split across `App/server/`, `App/client/`, and `App/model/`; preserve their project references and per-project options when changing configuration.

## Architecture

- `App/server/start.ts` sets up the Express API. Route handlers live in `App/server/rest/`; `App/server/mbs/MbsCtrl.ts` controls the Bedrock server process.
- The plugin API delegates discovery and activation to `App/server/data/Plugins.ts`. It scans `manifest.json` files in `development_behavior_packs/` and `development_resource_packs/`, while active state comes from the behavior/resource pack lists in `worlds/Bedrock level/`. Keep pack state changes in this server data/API flow.
- The browser client is bundled from `App/client/main.tsx`. React UI components and custom elements are initialized through `App/client/elements/main.ts`; browser API calls are grouped under `App/client/api/`.
- Shared plugin and metadata types are in `App/model/` and are consumed by both client and server code.

## Conventions

- Use the native ES module import style already used in each area: server TypeScript imports use `.ts` extensions; client TypeScript imports commonly use `.js` extensions.
- Client API functions return `[data, error]` tuples; follow that contract for new calls and preserve it when updating callers.
- Plugin kinds use the string literals `"behaviour"` and `"resource"` throughout the shared model and API; keep them consistent.
