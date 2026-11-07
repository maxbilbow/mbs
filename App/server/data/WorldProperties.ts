import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  DIFFICULTIES,
  GAME_MODES,
  type WorldSettings,
} from "../../model/Worlds.ts";

export class WorldError extends Error {
  readonly expose = true;
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateWorldName(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value === "." ||
    value === ".." ||
    Buffer.byteLength(value) > 200 ||
    /[\x00-\x1f\x7f;`?*\\/<>|":]/.test(value) ||
    value.endsWith(".")
  ) {
    throw new WorldError("Enter a valid world name without filename symbols.");
  }
}

export function validateSettings(value: unknown): WorldSettings {
  if (!value || typeof value !== "object")
    throw new WorldError("World settings are required.");
  const { seed, gameMode, difficulty } = value as Record<string, unknown>;
  const mode = GAME_MODES.find((mode) => mode === gameMode);
  const level = DIFFICULTIES.find((level) => level === difficulty);
  if (
    typeof seed !== "string" ||
    seed.length > 256 ||
    /[\x00-\x1f\x7f]/.test(seed) ||
    !mode ||
    !level
  ) {
    throw new WorldError("Invalid seed, game mode, or difficulty.");
  }
  return {
    seed,
    gameMode: mode,
    difficulty: level,
  };
}

export function readProperties(runtimeRoot: string) {
  const file = join(runtimeRoot, "server.properties");
  if (!lstatSync(file).isFile())
    throw new WorldError("Server properties must be a regular file.", 500);
  return readFileSync(file, "utf8");
}

export function property(text: string, key: string) {
  const matches = [...text.matchAll(new RegExp(`^${key}=([^\\r\\n]*)`, "gm"))];
  if (matches.length !== 1)
    throw new WorldError(
      `Server properties must contain exactly one ${key}.`,
      500,
    );
  return matches[0][1];
}

export function getWorldName(runtimeRoot: string) {
  const name = property(readProperties(runtimeRoot), "level-name").trim();
  validateWorldName(name);
  return name;
}

export function settingsFromProperties(text: string): WorldSettings {
  return validateSettings({
    seed: property(text, "level-seed"),
    gameMode: property(text, "gamemode"),
    difficulty: property(text, "difficulty"),
  });
}

export function updateProperties(
  text: string,
  name: string,
  settings: WorldSettings,
) {
  const changes = {
    "level-name": name,
    "level-seed": settings.seed,
    gamemode: settings.gameMode,
    difficulty: settings.difficulty,
  };
  for (const [key, value] of Object.entries(changes)) {
    property(text, key);
    text = text.replace(
      new RegExp(`^${key}=[^\\r\\n]*`, "m"),
      () => `${key}=${value}`,
    );
  }
  return text;
}

export function atomicWrite(file: string, content: string) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const mode = (() => {
    try {
      const stat = lstatSync(file);
      if (!stat.isFile())
        throw new WorldError(
          "Managed configuration must be a regular file.",
          500,
        );
      return stat.mode & 0o777;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0o600;
      throw error;
    }
  })();
  try {
    writeFileSync(temporary, content, { flag: "wx", mode });
    renameSync(temporary, file);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}
