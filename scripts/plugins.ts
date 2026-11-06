import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { BEDROCK_ROOT, REPO_ROOT } from "./paths.ts";

export function validateManifest(manifest: {
  header: { uuid: string; version: number[] };
  modules: { type: string; entry?: string }[];
}) {
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
      manifest.header.uuid,
    ) ||
    manifest.header.version.length !== 3 ||
    !manifest.header.version.every(
      (part) => Number.isSafeInteger(part) && part >= 0,
    )
  ) {
    throw new Error(
      "Plugin manifest must have a UUID and a three-part integer version.",
    );
  }
  if (
    !manifest.modules.some(
      (module) =>
        module.type === "script" && module.entry === "scripts/main.js",
    )
  ) {
    throw new Error("Expected script entry scripts/main.js.");
  }
}

export async function buildPlugin() {
  const source = join(REPO_ROOT, "plugins/max/behavior");
  const output = join(REPO_ROOT, ".build/plugins/max/behavior");
  const manifest = JSON.parse(
    readFileSync(join(source, "manifest.json"), "utf8"),
  );
  validateManifest(manifest);
  rmSync(output, { recursive: true, force: true });
  cpSync(source, output, { recursive: true });
  await build({
    entryPoints: [join(source, "scripts/main.js")],
    outfile: join(output, "scripts/main.js"),
    bundle: true,
    format: "esm",
    platform: "neutral",
    external: ["@minecraft/*"],
  });
  return { output, manifest };
}

export async function deployPlugin(runtimeRoot = BEDROCK_ROOT) {
  if (!existsSync(join(runtimeRoot, "bedrock_server"))) {
    throw new Error(`Not a Bedrock installation: ${runtimeRoot}`);
  }
  const { output, manifest } = await buildPlugin();
  const destination = join(runtimeRoot, "development_behavior_packs/__Max");
  const previous = join(destination, "manifest.json");
  if (
    existsSync(previous) &&
    JSON.parse(readFileSync(previous, "utf8")).header.uuid !==
      manifest.header.uuid
  ) {
    throw new Error("Deployment would overwrite a different pack UUID.");
  }
  mkdirSync(destination, { recursive: true });
  cpSync(output, destination, { recursive: true });
  console.log(
    `Deployed Max pack to ${destination}. Activation and restart are separate steps.`,
  );
}

if (import.meta.main) {
  switch (process.argv[2]) {
    case "build":
      await buildPlugin();
      break;
    case "deploy":
      await deployPlugin();
      break;
    default:
      throw new Error("Use build or deploy.");
  }
}
