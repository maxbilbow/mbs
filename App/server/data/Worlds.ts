import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { Logger } from "tslog";
import { BEDROCK_ROOT } from "../../../scripts/paths.ts";
import * as MbsCtrl from "../mbs/MbsCtrl.ts";
import type {
  CreateWorldInput,
  WorldInfo,
  WorldList,
  WorldSettings,
} from "../../model/Worlds.ts";
import {
  atomicWrite,
  getWorldName,
  readProperties,
  settingsFromProperties,
  updateProperties,
  validateSettings,
  validateWorldName,
  WorldError,
} from "./WorldProperties.ts";

const METADATA = ".mbs-world.json";

export function createWorldStore(
  runtimeRoot = BEDROCK_ROOT,
  control = MbsCtrl,
) {
  const worldsRoot = join(runtimeRoot, "worlds");
  const propertiesFile = join(runtimeRoot, "server.properties");
  const logger = new Logger({ name: "Worlds" });

  function worldPath(name: string) {
    validateWorldName(name);
    if (!lstatSync(worldsRoot).isDirectory())
      throw new WorldError("World storage must be a regular directory.", 500);
    const path = join(worldsRoot, name);
    if (!existsSync(path)) throw new WorldError("World not found.", 404);
    if (!lstatSync(path).isDirectory())
      throw new WorldError("World must be a regular directory.");
    return path;
  }

  function savedSettings(path: string): WorldSettings | null {
    const file = join(path, METADATA);
    if (!existsSync(file)) return null;
    if (!lstatSync(file).isFile())
      throw new WorldError("World metadata must be a regular file.", 500);
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("settings" in value)
    ) {
      throw new WorldError("Unsupported world metadata.", 500);
    }
    return validateSettings(value.settings);
  }

  function saveSettings(path: string, settings: WorldSettings) {
    atomicWrite(
      join(path, METADATA),
      JSON.stringify({ version: 1, settings }, null, 2) + "\n",
    );
  }

  function generated(path: string) {
    const db = join(path, "db");
    if (!existsSync(db)) return false;
    if (!lstatSync(db).isDirectory())
      throw new WorldError("World database must be a regular directory.", 500);
    return (
      existsSync(join(db, "CURRENT")) && lstatSync(join(db, "CURRENT")).isFile()
    );
  }

  function list(): WorldList {
    const activeWorld = getWorldName(runtimeRoot);
    const defaults = settingsFromProperties(readProperties(runtimeRoot));
    if (!lstatSync(worldsRoot).isDirectory())
      throw new WorldError("World storage must be a regular directory.", 500);
    const worlds: WorldInfo[] = [];
    for (const entry of readdirSync(worldsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      validateWorldName(entry.name);
      const path = worldPath(entry.name);
      const settings = savedSettings(path);
      const isGenerated = generated(path);
      if (!isGenerated && !settings && entry.name !== activeWorld) continue;
      worlds.push({
        name: entry.name,
        active: entry.name === activeWorld,
        generated: isGenerated,
        settings,
      });
    }
    if (!worlds.some((world) => world.active))
      throw new WorldError(
        "The configured world is missing from world storage.",
        500,
      );
    return {
      activeWorld,
      defaults,
      worlds: worlds.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async function activate(name: string): Promise<WorldList> {
    validateWorldName(name);
    list();
    const target = worldPath(name);
    const previous = readProperties(runtimeRoot);
    const previousName = getWorldName(runtimeRoot);
    if (name === previousName) return list();
    const outgoing = worldPath(previousName);
    const previousSettings = settingsFromProperties(previous);
    const settings = savedSettings(target);
    if (!settings && !generated(target))
      throw new WorldError("World has no generated data or manager settings.");
    const next = updateProperties(previous, name, settings ?? previousSettings);
    const running = control.getStatus().status === "active";
    let stopped = false;
    let writeAttempted = false;
    let phase = "stop the server";
    try {
      if (running) {
        await control.stop();
        stopped = true;
      }
      phase = "save world configuration";
      // CLI edits during the stop wait must not be overwritten.
      if (readProperties(runtimeRoot) !== previous)
        throw new WorldError(
          "Server configuration changed during switching.",
          409,
        );
      saveSettings(outgoing, previousSettings);
      writeAttempted = true;
      atomicWrite(propertiesFile, next);
      if (running) {
        phase = "start the selected world";
        await control.start();
      }
    } catch (error) {
      logger.error(`Failed to ${phase}`, error);
      let recovery = writeAttempted
        ? "Configuration may have changed; the selected world may still be configured."
        : "Configuration was not changed.";
      try {
        if (writeAttempted) {
          await control.stop();
          atomicWrite(propertiesFile, previous);
          recovery = "Previous configuration was restored.";
        }
        if (
          stopped &&
          !writeAttempted &&
          readProperties(runtimeRoot) !== previous
        ) {
          recovery +=
            " Configuration changed externally; the server was left stopped.";
        } else if (stopped) {
          await control.start();
          recovery += " The previous server state was restored.";
        }
      } catch (recoveryError) {
        logger.error("World switch recovery failed", recoveryError);
        recovery +=
          " Recovery failed; check server status and logs before retrying.";
      }
      throw new WorldError(`Unable to ${phase}. ${recovery}`, 500);
    }
    return list();
  }

  async function create(value: unknown): Promise<WorldList> {
    if (!value || typeof value !== "object")
      throw new WorldError("New-world details are required.");
    const fields = value as Record<string, unknown>;
    validateWorldName(fields.name);
    const settings = validateSettings(fields);
    if (typeof fields.activate !== "boolean")
      throw new WorldError("Choose whether to activate the new world.");
    const input: CreateWorldInput = {
      name: fields.name,
      activate: fields.activate,
      ...settings,
    };
    // Validate configuration and storage before reserving a new directory.
    list();
    const path = join(worldsRoot, input.name);
    try {
      mkdirSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new WorldError("A world with that name already exists.", 409);
      throw error;
    }
    try {
      saveSettings(path, settings);
    } catch (error) {
      const files = readdirSync(path);
      if (files.length === 1 && files[0] === METADATA)
        unlinkSync(join(path, METADATA));
      if (readdirSync(path).length === 0) rmdirSync(path);
      throw error;
    }
    if (input.activate) {
      try {
        return await activate(input.name);
      } catch (error) {
        logger.error("Created world but activation failed", error);
        const detail = error instanceof WorldError ? ` ${error.message}` : "";
        throw new WorldError(
          `World was created and retained, but activation failed.${detail}`,
          500,
        );
      }
    }
    return list();
  }

  return { list, activate, create };
}
