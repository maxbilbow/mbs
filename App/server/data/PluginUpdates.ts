import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { Logger } from "tslog";
import { BEDROCK_ROOT } from "../../../scripts/paths.ts";
import * as MbsCtrl from "../mbs/MbsCtrl.ts";
import { createPluginStore } from "./Plugins.ts";
import {
  atomicWrite,
  getWorldName,
  readProperties,
} from "./WorldProperties.ts";
import {
  createPluginProviders,
  PluginUpdateError,
  record,
  UUID,
  validateSource,
} from "./PluginSources.ts";
import {
  archiveHash,
  compareVersions,
  inspectArchive,
  packVersion,
  type InspectedPack,
} from "./PluginArchives.ts";
import type {
  PluginInstallPreview,
  PluginInstallResult,
  PluginRelease,
  PluginSource,
  PluginUpdateCheck,
} from "../../model/PluginUpdates.ts";

const TTL = 60 * 60 * 1000;

export function createPluginUpdateStore(
  runtimeRoot = BEDROCK_ROOT,
  control = MbsCtrl,
  providers = createPluginProviders(),
) {
  const sourceFile = join(runtimeRoot, ".mbs-plugin-sources.json");
  const workspace = join(runtimeRoot, ".mbs-plugin-updates");
  const plugins = createPluginStore(runtimeRoot);
  const logger = new Logger({ name: "PluginUpdates" });
  const stages = new Map<
    string,
    {
      directory: string;
      packs: InspectedPack[];
      preview: PluginInstallPreview;
      source?: PluginSource;
      fingerprint: string;
    }
  >();

  function regularDirectory(path: string) {
    if (!lstatSync(path).isDirectory())
      throw new PluginUpdateError(
        "Plugin storage must be a regular directory.",
        500,
      );
  }

  function ensureWorkspace() {
    regularDirectory(runtimeRoot);
    if (!existsSync(workspace)) mkdirSync(workspace);
    regularDirectory(workspace);
    for (const name of ["staging", "backups"]) {
      const path = join(workspace, name);
      if (!existsSync(path)) mkdirSync(path);
      regularDirectory(path);
    }
  }

  function sources(): PluginSource[] {
    if (!existsSync(sourceFile)) return [];
    if (!lstatSync(sourceFile).isFile())
      throw new PluginUpdateError(
        "Plugin source metadata must be a regular file.",
        500,
      );
    const body: unknown = JSON.parse(readFileSync(sourceFile, "utf8"));
    if (!record(body) || body.version !== 1 || !Array.isArray(body.sources))
      throw new PluginUpdateError("Unsupported plugin source metadata.", 500);
    const result = body.sources.map((source) => {
      if (
        !record(source) ||
        typeof source.id !== "string" ||
        !UUID.test(source.id)
      )
        throw new PluginUpdateError("Invalid plugin source metadata.", 500);
      return { ...validateSource(source), id: source.id };
    });
    if (
      new Set(result.map((source) => source.id)).size !== result.length ||
      new Set(result.flatMap((source) => source.uuids)).size !==
        result.flatMap((source) => source.uuids).length
    )
      throw new PluginUpdateError(
        "Plugin source metadata has overlapping identities.",
        500,
      );
    return result;
  }

  function save(sources: PluginSource[]) {
    atomicWrite(
      sourceFile,
      JSON.stringify({ version: 1, sources }, null, 2) + "\n",
    );
  }

  function list() {
    return { sources: sources(), curseforgeConfigured: providers.configured };
  }

  function link(value: unknown, id?: string) {
    const input = validateSource(value);
    const installed = plugins.findDevelompentPlugins();
    if (
      input.uuids.some(
        (uuid) =>
          !installed.some((plugin) => plugin.uuid.toLowerCase() === uuid),
      )
    )
      throw new PluginUpdateError(
        "Every linked UUID must belong to an installed pack.",
      );
    const previous = sources();
    if (id && !previous.some((source) => source.id === id))
      throw new PluginUpdateError("Plugin source not found.", 404);
    const source = { ...input, id: id ?? randomUUID() };
    if (
      previous.some(
        (existing) =>
          existing.id !== source.id &&
          existing.uuids.some((uuid) => source.uuids.includes(uuid)),
      )
    )
      throw new PluginUpdateError(
        "A selected pack already belongs to another source. Edit or remove that link first.",
        409,
      );
    save([...previous.filter((existing) => existing.id !== source.id), source]);
    return list();
  }

  function unlink(id: string) {
    const previous = sources();
    if (!previous.some((source) => source.id === id))
      throw new PluginUpdateError("Plugin source not found.", 404);
    save(previous.filter((source) => source.id !== id));
    return list();
  }

  function sourceById(id: string) {
    const source = sources().find((source) => source.id === id);
    if (!source) throw new PluginUpdateError("Plugin source not found.", 404);
    return source;
  }

  async function check(): Promise<PluginUpdateCheck[]> {
    const results: PluginUpdateCheck[] = [];
    for (const source of sources()) {
      try {
        const release = await providers.latest(source);
        const newerInstalled =
          source.provider === "curseforge" &&
          source.installedRelease &&
          Number(source.installedRelease) > Number(release.id);
        const status =
          source.installedRelease === release.id || newerInstalled
            ? "current"
            : source.installedRelease
              ? "update"
              : "unknown";
        results.push({
          sourceId: source.id,
          status,
          release,
          message: newerInstalled
            ? "The recorded installed release is newer than the selected stable release."
            : status === "current"
              ? "Installed upstream release is current."
              : status === "unknown"
                ? "Latest release found; the installed upstream release is unknown."
                : "A different stable upstream release is available. Review it before installing.",
        });
      } catch (error) {
        logger.error(`Update check failed for ${source.id}`, error);
        results.push({
          sourceId: source.id,
          status: "error",
          message:
            error instanceof Error ? error.message : "Update lookup failed.",
        });
      }
    }
    return results;
  }

  function worldFiles() {
    const world = getWorldName(runtimeRoot);
    const directory = join(runtimeRoot, "worlds", world);
    regularDirectory(join(runtimeRoot, "worlds"));
    regularDirectory(directory);
    return ["behavior", "resource"].map((type) =>
      join(directory, `world_${type}_packs.json`),
    );
  }

  function bytesAt(path: string) {
    if (!existsSync(path)) return null;
    if (!lstatSync(path).isFile())
      throw new PluginUpdateError("Pack metadata must be a regular file.", 500);
    return readFileSync(path);
  }

  function activePacks() {
    return worldFiles().flatMap((file, index) => {
      const content = bytesAt(file);
      const body: unknown = content ? JSON.parse(content.toString("utf8")) : [];
      if (
        !Array.isArray(body) ||
        !body.every(
          (pack) =>
            record(pack) &&
            typeof pack.pack_id === "string" &&
            UUID.test(pack.pack_id) &&
            packVersion(pack.version),
        )
      )
        throw new PluginUpdateError("Invalid world pack list.", 500);
      return body.map(
        (pack: {
          pack_id: string;
          version: readonly [number, number, number];
        }) => ({
          uuid: pack.pack_id.toLowerCase(),
          version: pack.version,
          type: index === 0 ? ("behaviour" as const) : ("resource" as const),
        }),
      );
    });
  }

  function directoryFor(type: "behaviour" | "resource") {
    const path = join(
      runtimeRoot,
      type === "behaviour"
        ? "development_behavior_packs"
        : "development_resource_packs",
    );
    regularDirectory(path);
    return path;
  }

  function destinations(packs: InspectedPack[]) {
    const installed = plugins
      .findDevelompentPlugins()
      .flatMap((plugin) => plugin.versions);
    return packs.map((pack) => {
      const matching = installed.filter(
        (version) =>
          version.uuid.toLowerCase() === pack.uuid &&
          compareVersions(version.version, pack.version) === 0,
      );
      if (
        matching.some((version) => version.type !== pack.type) ||
        matching.length > 1
      )
        throw new PluginUpdateError(
          "Installed pack identity/version is ambiguous.",
          409,
        );
      const path = join(
        directoryFor(pack.type),
        matching[0]?.folder ?? `mbs-${pack.uuid}-${pack.version.join(".")}`,
      );
      if (existsSync(path)) {
        regularDirectory(path);
        if (!matching.length)
          throw new PluginUpdateError(
            "The destination belongs to an unrelated pack.",
            409,
          );
      }
      return path;
    });
  }

  function fingerprint(packs: InspectedPack[]) {
    const hash = createHash("sha256");
    function add(path: string) {
      hash.update(path);
      if (!existsSync(path)) {
        hash.update("missing");
        return;
      }
      const stat = lstatSync(path);
      if (stat.isFile()) hash.update(readFileSync(path));
      else if (stat.isDirectory()) {
        for (const name of readdirSync(path).sort()) add(join(path, name));
      } else
        throw new PluginUpdateError(
          "Plugin storage contains a link or special file.",
        );
    }
    for (const path of [
      sourceFile,
      join(runtimeRoot, "server.properties"),
      ...worldFiles(),
      ...destinations(packs),
      ...packs.map((pack) => pack.path),
    ])
      add(path);
    // Inventory changes can affect dependencies or introduce an identity collision.
    for (const plugin of plugins.findDevelompentPlugins()) {
      for (const version of plugin.versions)
        add(join(directoryFor(version.type), version.folder, "manifest.json"));
    }
    return hash.digest("hex");
  }

  function validatePacks(packs: InspectedPack[], source?: PluginSource) {
    const installed = plugins
      .findDevelompentPlugins()
      .flatMap((plugin) => plugin.versions);
    const active = activePacks();
    if (
      source &&
      (packs.length !== source.uuids.length ||
        source.uuids.some((uuid) => !packs.some((pack) => pack.uuid === uuid)))
    )
      throw new PluginUpdateError(
        "The archive must contain exactly the linked pack UUIDs. Import it separately or edit the source's companion-pack selection.",
      );
    const engine = control
      .getStatus()
      .version.split(".")
      .slice(0, 3)
      .map(Number);
    if (!packVersion(engine))
      throw new PluginUpdateError(
        "Installed Bedrock version cannot be determined.",
      );
    for (const pack of packs) {
      if (pack.minEngine && compareVersions(engine, pack.minEngine) < 0)
        throw new PluginUpdateError(
          `${pack.name} requires Bedrock ${pack.minEngine.join(".")} or newer.`,
        );
      if (
        installed.some(
          (version) =>
            version.uuid.toLowerCase() === pack.uuid &&
            version.type !== pack.type,
        )
      )
        throw new PluginUpdateError(
          "An archive changes an installed pack's type.",
        );
      const versions = installed.filter(
        (version) => version.uuid.toLowerCase() === pack.uuid,
      );
      if (
        versions.some(
          (version) => compareVersions(version.version, pack.version) > 0,
        )
      )
        throw new PluginUpdateError(
          `${pack.name} would downgrade an installed pack. Choose a newer archive.`,
        );
    }
    const available = [
      ...installed.map((pack) => ({ ...pack, uuid: pack.uuid.toLowerCase() })),
      ...packs,
    ];
    const plannedActive = active.map((current) => {
      const replacement = packs.find((pack) => pack.uuid === current.uuid);
      return replacement ?? current;
    });
    for (const pack of packs) {
      for (const dependency of pack.dependencies) {
        if (
          !available.some(
            (candidate) =>
              candidate.uuid === dependency.uuid &&
              compareVersions(candidate.version, dependency.version) === 0,
          )
        )
          throw new PluginUpdateError(
            `${pack.name} requires missing pack ${dependency.uuid} v${dependency.version.join(".")}.`,
          );
      }
    }
    for (const current of plannedActive) {
      const replacement = packs.find((pack) => pack.uuid === current.uuid);
      const installedPack = installed.find(
        (pack) =>
          pack.uuid.toLowerCase() === current.uuid &&
          pack.type === current.type &&
          compareVersions(pack.version, current.version) === 0,
      );
      let dependencies: unknown = replacement?.dependencies;
      if (!replacement && installedPack) {
        const manifest: unknown = JSON.parse(
          readFileSync(
            join(
              directoryFor(current.type),
              installedPack.folder,
              "manifest.json",
            ),
            "utf8",
          ),
        );
        if (record(manifest)) dependencies = manifest.dependencies;
      }
      if (dependencies === undefined) continue;
      if (!Array.isArray(dependencies))
        throw new PluginUpdateError("Invalid active pack dependencies.");
      for (const dependency of dependencies) {
        if (!record(dependency) || !("uuid" in dependency)) continue;
        if (
          typeof dependency.uuid !== "string" ||
          !packVersion(dependency.version)
        )
          throw new PluginUpdateError("Invalid active pack dependency.");
        const { uuid, version } = dependency;
        if (
          !plannedActive.some(
            (candidate) =>
              candidate.uuid === uuid.toLowerCase() &&
              compareVersions(candidate.version, version) === 0,
          )
        )
          throw new PluginUpdateError(
            "The update would leave an active pack dependency unsatisfied. Link and update companion packs together.",
          );
      }
    }
    return active;
  }

  function expireStages() {
    for (const [token, stage] of stages) {
      if (Date.parse(stage.preview.expiresAt) <= Date.now()) {
        rmSync(stage.directory, { recursive: true });
        stages.delete(token);
      }
    }
  }

  async function stageArchive(
    bytes: Buffer,
    source?: PluginSource,
    release?: PluginRelease,
  ): Promise<PluginInstallPreview> {
    if (
      source &&
      JSON.stringify(sourceById(source.id)) !== JSON.stringify(source)
    )
      throw new PluginUpdateError(
        "The source changed while downloading. Check for updates again.",
        409,
      );
    ensureWorkspace();
    expireStages();
    if (stages.size >= 5)
      throw new PluginUpdateError(
        "Five previews are already staged. Cancel or install one first.",
        409,
      );
    const token = randomUUID();
    const directory = join(workspace, "staging", token);
    mkdirSync(directory);
    try {
      const packs = await inspectArchive(bytes, directory);
      const active = validatePacks(packs, source);
      const targets = destinations(packs);
      const preview: PluginInstallPreview = {
        token,
        expiresAt: new Date(Date.now() + TTL).toISOString(),
        ...(release ? { release } : {}),
        packs: packs.map((pack, index) => ({
          uuid: pack.uuid,
          name: pack.name,
          type: pack.type,
          version: pack.version,
          replacesSameVersion: existsSync(targets[index]),
          activates: active.some((current) => current.uuid === pack.uuid),
        })),
        warnings: [
          "Only install packs from authors you trust. Script API compatibility, experimental toggles, and in-game behavior cannot be verified automatically.",
          "New/inactive packs stay inactive. Updated active packs use the new version in the selected world; other worlds retain their selections.",
          ...(packs.some((pack) => !pack.minEngine)
            ? ["Some packs do not declare a minimum Bedrock version."]
            : []),
          ...(targets.some((path) => existsSync(path))
            ? [
                "Same-version replacements change files for every world using that version. A backup is retained.",
              ]
            : []),
        ],
      };
      stages.set(token, {
        directory,
        packs,
        source,
        preview,
        fingerprint: fingerprint(packs),
      });
      return preview;
    } catch (error) {
      rmSync(directory, { recursive: true });
      throw error;
    }
  }

  async function stageUpdate(id: string, expectedRelease: unknown) {
    const source = sourceById(id);
    const release = await providers.latest(source);
    if (release.id !== expectedRelease)
      throw new PluginUpdateError(
        "The release changed since checking. Check for updates again.",
        409,
      );
    if (!release.downloadUrl)
      throw new PluginUpdateError(
        "Automatic download is unavailable. Open the release page and import the downloaded archive.",
      );
    const bytes = await providers.download(release.downloadUrl);
    if (
      release.sha256 &&
      archiveHash(bytes).toLowerCase() !== release.sha256.toLowerCase()
    )
      throw new PluginUpdateError(
        "Downloaded archive checksum does not match the release.",
      );
    return stageArchive(bytes, source, release);
  }

  async function importArchive(
    bytes: Buffer,
    sourceId?: string,
    releaseId?: string,
  ) {
    if (
      releaseId &&
      (!sourceId || releaseId.length > 200 || /[\x00-\x1f\x7f]/.test(releaseId))
    )
      throw new PluginUpdateError(
        "An upstream release ID requires a linked source and a valid ID.",
      );
    const source = sourceId ? sourceById(sourceId) : undefined;
    if (
      source?.provider === "curseforge" &&
      releaseId &&
      !/^[1-9]\d*$/.test(releaseId)
    )
      throw new PluginUpdateError(
        "CurseForge's release ID must be a numeric file ID.",
      );
    const release =
      source && releaseId
        ? { id: releaseId, name: releaseId, url: source.url }
        : undefined;
    return stageArchive(bytes, source, release);
  }

  function cancel(token: string) {
    expireStages();
    const stage = stages.get(token);
    if (!stage)
      throw new PluginUpdateError(
        "Preview expired or not found. Inspect the archive again.",
        404,
      );
    rmSync(stage.directory, { recursive: true });
    stages.delete(token);
  }

  async function install(
    token: string,
    confirmed: unknown,
  ): Promise<PluginInstallResult> {
    if (confirmed !== true)
      throw new PluginUpdateError(
        "Installation requires explicit confirmation.",
      );
    expireStages();
    const stage = stages.get(token);
    if (!stage)
      throw new PluginUpdateError(
        "Preview expired or not found. Inspect the archive again.",
        404,
      );
    ensureWorkspace();
    if (fingerprint(stage.packs) !== stage.fingerprint)
      throw new PluginUpdateError(
        "Packs, source metadata, or world configuration changed. Create a new preview.",
        409,
      );
    validatePacks(stage.packs, stage.source);
    const targets = destinations(stage.packs);
    const configuration = readProperties(runtimeRoot);
    const running = control.getStatus().status === "active";
    const metadataPaths = [...worldFiles(), sourceFile];
    const metadata = metadataPaths.map((path) => bytesAt(path));
    const backup = join(workspace, "backups", randomUUID());
    mkdirSync(backup);
    const existed = targets.map((path) => existsSync(path));
    // Back up before stopping, but recheck all inputs after the stop wait.
    for (const [index, path] of targets.entries()) {
      if (existed[index])
        cpSync(path, join(backup, `pack-${index}`), { recursive: true });
    }
    for (const [index, content] of metadata.entries()) {
      if (content)
        writeFileSync(join(backup, `metadata-${index}.json`), content);
    }
    writeFileSync(
      join(backup, "receipt.json"),
      JSON.stringify(
        {
          targets: targets.map((path, index) => ({
            path: relative(runtimeRoot, path),
            existed: existed[index],
            backup: `pack-${index}`,
          })),
          metadata: metadataPaths.map((path, index) => ({
            path: relative(runtimeRoot, path),
            existed: metadata[index] !== null,
            backup: `metadata-${index}.json`,
          })),
          preview: stage.preview,
        },
        null,
        2,
      ),
    );
    let stopped = false;
    let changed = false;
    try {
      if (running) {
        await control.stop();
        stopped = true;
      }
      if (control.getStatus().status !== "stopped")
        throw new PluginUpdateError(
          "Minecraft must be stopped before installing.",
          409,
        );
      if (fingerprint(stage.packs) !== stage.fingerprint)
        throw new PluginUpdateError(
          "Configuration or packs changed during shutdown; installation was cancelled.",
          409,
        );
      for (const [index, pack] of stage.packs.entries()) {
        changed = true;
        if (existed[index]) rmSync(targets[index], { recursive: true });
        renameSync(pack.path, targets[index]);
      }
      const active = activePacks();
      for (const pack of stage.packs) {
        if (active.some((current) => current.uuid === pack.uuid))
          plugins.activatePlugin(pack.type, pack.uuid, pack.version);
      }
      const previous = sources();
      if (
        previous.some((source) =>
          source.uuids.some((uuid) =>
            stage.packs.some((pack) => pack.uuid === uuid),
          ),
        )
      )
        save(
          previous.map((source) =>
            source.uuids.some((uuid) =>
              stage.packs.some((pack) => pack.uuid === uuid),
            )
              ? {
                  ...source,
                  installedRelease:
                    source.id === stage.source?.id
                      ? stage.preview.release?.id
                      : undefined,
                }
              : source,
          ),
        );
      if (running) await control.start();
      return { backup: relative(runtimeRoot, backup), running };
    } catch (error) {
      logger.error("Plugin installation failed", error);
      let recovery = changed
        ? "Recovery is required."
        : "No pack changes were made.";
      try {
        if (changed) {
          await control.stop();
          if (control.getStatus().status !== "stopped")
            throw new Error(
              "Minecraft is still running; refusing to restore pack files.",
            );
          for (const [index, path] of targets.entries()) {
            if (existsSync(path)) rmSync(path, { recursive: true });
            if (existed[index])
              cpSync(join(backup, `pack-${index}`), path, { recursive: true });
          }
          for (const [index, path] of metadataPaths.entries()) {
            const content = metadata[index];
            if (content) atomicWrite(path, content.toString("utf8"));
            else if (existsSync(path)) unlinkSync(path);
          }
          recovery = "Previous packs and pack selections were restored.";
        }
        if (stopped && readProperties(runtimeRoot) === configuration) {
          await control.start();
          recovery += " The previous running state was restored.";
        } else if (stopped) {
          recovery +=
            " Server configuration changed externally; Minecraft was left stopped.";
        }
      } catch (recoveryError) {
        logger.error("Plugin recovery failed", recoveryError);
        recovery +=
          " Recovery failed; check server logs and restore from the retained backup before retrying.";
      }
      throw new PluginUpdateError(
        `${error instanceof Error ? error.message : "Installation failed."} ${recovery} Backup: ${relative(runtimeRoot, backup)}.`,
        500,
      );
    } finally {
      rmSync(stage.directory, { recursive: true });
      stages.delete(token);
    }
  }

  return {
    list,
    link,
    unlink,
    check,
    stageUpdate,
    importArchive,
    cancel,
    install,
  };
}
