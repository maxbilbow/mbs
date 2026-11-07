import { build } from "esbuild";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { BEDROCK_ROOT, REPO_ROOT } from "./paths.ts";

type PackKind = "behavior" | "resource";

interface PackManifest {
  header: { uuid: string; version: number[] };
  modules: ({
    uuid: string;
    version: number[];
  } & (
    | { type: "script"; language: "javascript"; entry: string }
    | { type: "data" | "resources" }
  ))[];
}

interface BuildOptions {
  sourceRoot?: string;
  outputRoot?: string;
}

interface Pack {
  name: string;
  kind: PackKind;
  source: string;
  output: string;
  manifest: PackManifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIdentity(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.uuid === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.uuid) &&
    Array.isArray(value.version) &&
    value.version.length === 3 &&
    value.version.every((part) => Number.isSafeInteger(part) && part >= 0)
  );
}

export function validateManifest(
  manifest: unknown,
  kind: PackKind = "behavior",
): asserts manifest is PackManifest {
  if (!isRecord(manifest) || !isIdentity(manifest.header)) {
    throw new Error(
      "Plugin manifest must have a UUID and a three-part integer version.",
    );
  }
  if (!Array.isArray(manifest.modules) || manifest.modules.length === 0) {
    throw new Error("Plugin manifest must declare modules.");
  }
  const entries = new Set<string>();
  for (const module of manifest.modules) {
    if (!isRecord(module) || !isIdentity(module)) {
      throw new Error(
        "Each module must have a UUID and a three-part integer version.",
      );
    }
    const allowed = kind === "behavior" ? ["data", "script"] : ["resources"];
    if (typeof module.type !== "string" || !allowed.includes(module.type)) {
      throw new Error(`Unsupported ${kind} module type: ${module.type}`);
    }
    if (module.type === "script") {
      if (
        module.language !== "javascript" ||
        typeof module.entry !== "string" ||
        !module.entry.startsWith("scripts/") ||
        !module.entry.endsWith(".js") ||
        /[\\:]/.test(module.entry) ||
        module.entry
          .split("/")
          .some((part) => !part || part === "." || part === "..")
      ) {
        throw new Error(
          "Script modules must declare a safe scripts/*.js entry and javascript language.",
        );
      }
      if (entries.has(module.entry)) {
        throw new Error(`Duplicate script entry: ${module.entry}`);
      }
      entries.add(module.entry);
    }
  }
}

function discoverPacks({
  sourceRoot = join(REPO_ROOT, "plugins"),
  outputRoot = join(REPO_ROOT, ".build/plugins"),
}: BuildOptions): Pack[] {
  const packs: Pack[] = [];
  const identities = new Set<string>();
  for (const directory of readdirSync(sourceRoot, { withFileTypes: true }).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (!directory.isDirectory()) continue;
    for (const kind of ["behavior", "resource"] as const) {
      const source = join(sourceRoot, directory.name, kind);
      if (!existsSync(source)) continue;
      const manifestPath = join(source, "manifest.json");
      try {
        const manifest: unknown = JSON.parse(
          readFileSync(manifestPath, "utf8"),
        );
        validateManifest(manifest, kind);
        for (const identity of [manifest.header, ...manifest.modules]) {
          const uuid = identity.uuid.toLowerCase();
          if (identities.has(uuid)) {
            throw new Error(`Duplicate pack/module UUID: ${uuid}`);
          }
          identities.add(uuid);
        }
        for (const module of manifest.modules) {
          if (module.type !== "script") continue;
          const entry = join(source, module.entry.slice(0, -3) + ".ts");
          if (!existsSync(entry) || !lstatSync(entry).isFile()) {
            throw new Error(`Missing TypeScript entry: ${entry}`);
          }
        }
        packs.push({
          name: directory.name,
          kind,
          source,
          output: join(outputRoot, directory.name, kind),
          manifest,
        });
      } catch (error) {
        throw new Error(
          `Invalid source pack ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
  }
  if (packs.length === 0) {
    throw new Error(`No source packs found in ${sourceRoot}.`);
  }
  return packs;
}

export async function buildPlugins(
  options: BuildOptions = {},
): Promise<Pack[]> {
  const packs = discoverPacks(options);
  const bundles = [];
  for (const pack of packs) {
    const entryPoints = pack.manifest.modules.flatMap((module) =>
      module.type === "script"
        ? [
            {
              in: join(pack.source, module.entry.slice(0, -3) + ".ts"),
              out: module.entry.slice(0, -3),
            },
          ]
        : [],
    );
    bundles.push(
      entryPoints.length === 0
        ? []
        : (
            await build({
              entryPoints,
              outdir: pack.output,
              bundle: true,
              format: "esm",
              platform: "neutral",
              external: ["@minecraft/*"],
              write: false,
            })
          ).outputFiles,
    );
  }
  for (const [index, pack] of packs.entries()) {
    rmSync(pack.output, { recursive: true, force: true });
    cpSync(pack.source, pack.output, {
      recursive: true,
      filter: (path) => {
        if (lstatSync(path).isSymbolicLink()) {
          throw new Error(`Pack assets must not be symbolic links: ${path}`);
        }
        return (
          !path.endsWith(".ts") && !/^tsconfig.*\.json$/.test(basename(path))
        );
      },
    });
    for (const file of bundles[index]) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.contents);
    }
    console.log(`Built ${pack.name}/${pack.kind} at ${pack.output}.`);
  }
  return packs;
}

export async function deployPlugins(
  runtimeRoot = BEDROCK_ROOT,
  options: BuildOptions = {},
) {
  if (!existsSync(join(runtimeRoot, "bedrock_server"))) {
    throw new Error(`Not a Bedrock installation: ${runtimeRoot}`);
  }
  const packs = await buildPlugins(options);
  const destinations = packs.map((pack) =>
    join(runtimeRoot, `development_${pack.kind}_packs`, pack.name),
  );
  for (const [index, pack] of packs.entries()) {
    const destination = destinations[index];
    if (!existsSync(destination)) continue;
    const previous: unknown = JSON.parse(
      readFileSync(join(destination, "manifest.json"), "utf8"),
    );
    if (
      !isRecord(previous) ||
      !isRecord(previous.header) ||
      typeof previous.header.uuid !== "string" ||
      previous.header.uuid.toLowerCase() !==
        pack.manifest.header.uuid.toLowerCase()
    ) {
      throw new Error(
        `Deployment would overwrite a different pack UUID at ${destination}.`,
      );
    }
  }
  for (const [index, pack] of packs.entries()) {
    const destination = destinations[index];
    // Only replace a pack after all destinations pass the identity checks.
    rmSync(destination, { recursive: true, force: true });
    cpSync(pack.output, destination, { recursive: true });
    console.log(
      `Deployed ${pack.name}/${pack.kind} to ${destination}. Activation and restart are separate steps.`,
    );
  }
  return packs;
}

if (import.meta.main) {
  switch (process.argv[2]) {
    case "build":
      await buildPlugins();
      break;
    case "deploy":
      await deployPlugins();
      break;
    default:
      throw new Error("Use build or deploy.");
  }
}
