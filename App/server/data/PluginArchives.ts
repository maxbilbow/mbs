import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { createHash } from "node:crypto";
import yauzl from "yauzl";
import { crc32 } from "node:zlib";
import type { PackVersion } from "../../model/PluginUpdates.ts";
import { validateManifest } from "../../../scripts/plugins.ts";
import {
  MAX_DOWNLOAD,
  PluginUpdateError,
  record,
  UUID,
} from "./PluginSources.ts";

export type InspectedPack = {
  uuid: string;
  name: string;
  type: "behaviour" | "resource";
  version: PackVersion;
  path: string;
  minEngine?: PackVersion;
  dependencies: { uuid: string; version: PackVersion }[];
};

export function packVersion(value: unknown): value is PackVersion {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => Number.isSafeInteger(part) && part >= 0)
  );
}

export function compareVersions(a: PackVersion, b: PackVersion) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export async function inspectArchive(
  bytes: Buffer,
  directory: string,
): Promise<InspectedPack[]> {
  if (bytes.length > MAX_DOWNLOAD)
    throw new PluginUpdateError("Archive exceeds the 64 MiB download limit.");
  const packs: InspectedPack[] = [];
  const identities = new Set<string>();
  let entries = 0;
  let expanded = 0;

  async function unpack(buffer: Buffer, depth: number) {
    if (depth > 3)
      throw new PluginUpdateError("Archive nesting exceeds three levels.");
    const files = await new Promise<Map<string, Buffer>>((resolve, reject) => {
      yauzl.fromBuffer(
        buffer,
        { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
        (error, zip) => {
          if (error || !zip) {
            reject(error ?? new Error("Unable to open ZIP."));
            return;
          }
          const files = new Map<string, Buffer>();
          const paths = new Set<string>();
          let failed = false;
          function fail(error: unknown) {
            if (failed) return;
            failed = true;
            zip!.close();
            reject(error);
          }
          zip.on("error", fail);
          zip.on("end", () => resolve(files));
          zip.on("entry", (entry: yauzl.Entry) => {
            const path = entry.fileName;
            const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
            if (
              ++entries > 10_000 ||
              expanded + entry.uncompressedSize > 256 * 1024 * 1024 ||
              !path ||
              path.includes("//") ||
              path.length > 500 ||
              /[\\:\x00-\x1f\x7f]/.test(path) ||
              path.startsWith("/") ||
              path
                .split("/")
                .filter(Boolean)
                .some((part) => part === "." || part === "..") ||
              (mode !== 0 && mode !== 0x8000 && mode !== 0x4000) ||
              (mode === 0x4000 && !path.endsWith("/")) ||
              entry.isEncrypted() ||
              paths.has(path.replace(/\/$/, "").toLowerCase())
            ) {
              fail(
                new PluginUpdateError(
                  "Archive contains unsafe/duplicate paths, links, or exceeds extraction limits.",
                ),
              );
              return;
            }
            paths.add(path.replace(/\/$/, "").toLowerCase());
            expanded += entry.uncompressedSize;
            if (path.endsWith("/")) {
              zip.readEntry();
              return;
            }
            zip.openReadStream(entry, (error, stream) => {
              if (error || !stream) {
                fail(error ?? new Error("Unable to read ZIP entry."));
                return;
              }
              const chunks: Buffer[] = [];
              let size = 0;
              let checksum = 0;
              stream.on("error", fail);
              stream.on("data", (chunk: Buffer) => {
                size += chunk.length;
                checksum = crc32(chunk, checksum);
                if (size > entry.uncompressedSize) {
                  stream.destroy(
                    new PluginUpdateError(
                      "Archive entry exceeds its declared size.",
                    ),
                  );
                  return;
                }
                chunks.push(chunk);
              });
              stream.on("end", () => {
                if (failed) return;
                if (
                  size !== entry.uncompressedSize ||
                  checksum !== entry.crc32
                ) {
                  fail(
                    new PluginUpdateError(
                      "Archive entry failed size/checksum validation.",
                    ),
                  );
                  return;
                }
                files.set(path, Buffer.concat(chunks));
                zip.readEntry();
              });
            });
          });
          zip.readEntry();
        },
      );
    });
    const manifests = [...files.keys()].filter(
      (path) => posix.basename(path) === "manifest.json",
    );
    for (const manifestPath of manifests) {
      if (packs.length >= 32)
        throw new PluginUpdateError("Archive contains more than 32 packs.");
      const content = files.get(manifestPath)!;
      if (content.length > 1024 * 1024)
        throw new PluginUpdateError("Manifest exceeds 1 MiB.");
      let manifest: unknown;
      try {
        manifest = JSON.parse(content.toString("utf8").replace(/^\uFEFF/, ""));
      } catch {
        throw new PluginUpdateError(`Invalid JSON in ${manifestPath}.`);
      }
      if (!record(manifest) || !Array.isArray(manifest.modules))
        throw new PluginUpdateError(`Missing modules in ${manifestPath}.`);
      const kind = manifest.modules.every(
        (module) => record(module) && module.type === "resources",
      )
        ? "resource"
        : "behavior";
      try {
        validateManifest(manifest, kind);
      } catch (error) {
        throw new PluginUpdateError(
          `${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const uuid = manifest.header.uuid.toLowerCase();
      if (identities.has(uuid))
        throw new PluginUpdateError(
          `Multiple packs with UUID ${uuid}; choose an unambiguous archive.`,
        );
      identities.add(uuid);
      for (const module of manifest.modules) {
        const moduleUuid = module.uuid.toLowerCase();
        if (identities.has(moduleUuid))
          throw new PluginUpdateError(
            `Duplicate pack/module UUID ${moduleUuid}.`,
          );
        identities.add(moduleUuid);
      }
      const prefix =
        posix.dirname(manifestPath) === "."
          ? ""
          : posix.dirname(manifestPath) + "/";
      if (
        manifests.some(
          (other) => other !== manifestPath && other.startsWith(prefix),
        )
      )
        throw new PluginUpdateError(
          "Pack folders overlap; import separate pack archives.",
        );
      const dependencies: InspectedPack["dependencies"] = [];
      if ("dependencies" in manifest) {
        if (!Array.isArray(manifest.dependencies))
          throw new PluginUpdateError("Invalid manifest dependencies.");
        for (const dependency of manifest.dependencies) {
          if (!record(dependency))
            throw new PluginUpdateError("Invalid manifest dependency.");
          if ("uuid" in dependency) {
            if (
              typeof dependency.uuid !== "string" ||
              !UUID.test(dependency.uuid) ||
              !packVersion(dependency.version)
            )
              throw new PluginUpdateError(
                "Pack dependencies must declare a UUID and three-part version.",
              );
            dependencies.push({
              uuid: dependency.uuid.toLowerCase(),
              version: dependency.version,
            });
          } else if (
            typeof dependency.module_name !== "string" ||
            !dependency.module_name.startsWith("@minecraft/") ||
            typeof dependency.version !== "string"
          ) {
            throw new PluginUpdateError("Unsupported script API dependency.");
          }
        }
      }
      const header = manifest.header;
      if (
        !("name" in header) ||
        typeof header.name !== "string" ||
        !header.name.trim() ||
        ("description" in header && typeof header.description !== "string")
      )
        throw new PluginUpdateError(
          "Pack headers must declare a name and a text description when present.",
        );
      if (!packVersion(header.version))
        throw new PluginUpdateError("Invalid pack version.");
      if (
        "min_engine_version" in header &&
        !packVersion(header.min_engine_version)
      )
        throw new PluginUpdateError("Invalid minimum engine version.");
      const path = join(directory, uuid);
      mkdirSync(path, { recursive: true });
      for (const [name, content] of files) {
        if (!name.startsWith(prefix)) continue;
        const relative = name.slice(prefix.length);
        const target = join(path, relative);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content, { flag: "wx" });
      }
      for (const module of manifest.modules) {
        if (module.type === "script" && !files.has(prefix + module.entry))
          throw new PluginUpdateError(
            `Missing JavaScript entry ${module.entry}.`,
          );
      }
      packs.push({
        uuid,
        name:
          "name" in header && typeof header.name === "string"
            ? header.name
            : uuid,
        type: kind === "behavior" ? "behaviour" : "resource",
        version: header.version,
        path,
        dependencies,
        ...("min_engine_version" in header &&
        packVersion(header.min_engine_version)
          ? { minEngine: header.min_engine_version }
          : {}),
      });
    }
    for (const [name, content] of files) {
      if (
        /\.(mcpack|mcaddon|zip)$/i.test(name) &&
        !manifests.some(
          (path) =>
            posix.dirname(path) === "." ||
            name.startsWith(posix.dirname(path) + "/"),
        )
      )
        await unpack(content, depth + 1);
    }
  }
  try {
    await unpack(bytes, 0);
  } catch (error) {
    if (error instanceof PluginUpdateError) throw error;
    throw new PluginUpdateError(
      `Unable to inspect archive: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!packs.length)
    throw new PluginUpdateError(
      "No supported Bedrock packs found. Import a .mcpack, .mcaddon, or ZIP containing pack manifests.",
    );
  return packs;
}

export function archiveHash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
