# Copilot Instructions

## Build and run

- `npm run build` bundles the browser client from `App/client/main.tsx` into `App/www/js`.
- `npm start` starts the Express API on port 8081. When `CADDY_OUTPUT_PATH` is set, startup also builds the client and syncs `App/www/` to that path.
- There are no test or lint scripts in `package.json`, and no test files are present. Prettier is installed; check formatting with `npx prettier --check <files>`.

## Architecture

- The project combines an Express API and a browser-based plugin manager. `App/server/start.ts` wires up the API routes; the client entry point, `App/client/main.tsx`, loads the UI.
- The client UI combines React components with custom elements. Client API modules call the Express routes; shared plugin types live in `App/model/`.
- The API manages the Bedrock server process and discovers development behavior/resource packs. Activating or deactivating a pack updates the corresponding pack list in the world data under `worlds/Bedrock level/`.

## Conventions

- The codebase uses native ES modules. Server TypeScript imports use `.ts` extensions; client imports commonly use `.js` extensions. Keep imports consistent with the surrounding code.
- Client API functions represent success and failure as `[data, error]` tuples; follow this shape when adding client calls.
- Plugin data comes from pack `manifest.json` files in `development_behavior_packs/` and `development_resource_packs/`. The active state is determined by the world’s behavior/resource pack JSON files, so changes to plugin state should go through the existing data/API flow rather than updating only the UI.
- The root and app TypeScript configurations are strict and use project references; shared model changes may affect both client and server.
