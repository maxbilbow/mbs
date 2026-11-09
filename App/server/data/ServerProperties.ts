import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { WorldProperties } from "../../model/Worlds.ts";
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

export const TEMPLATE_FILE = "server.properties.template";
export const WORLD_PROPERTIES_FILE = "server.properties";

function readBytes(file: string) {
  if (!lstatSync(file).isFile())
    throw new WorldError("Managed properties must be a regular file.", 500);
  return readFileSync(file);
}

function read(file: string) {
  return readBytes(file).toString("utf8");
}

export function parseProperties(text: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^([a-z][a-z0-9-]*)=([^\r\n]*)$/.exec(line);
    if (!match || Object.hasOwn(result, match[1]))
      throw new WorldError("Invalid or duplicate server property.", 500);
    result[match[1]] = match[2];
  }
  return result;
}

export function mergeProperties(
  template: string,
  overrides: Record<string, string>,
) {
  const remaining = new Map(Object.entries(overrides));
  const newline = template.includes("\r\n") ? "\r\n" : "\n";
  parseProperties(template);
  let text = template.replace(
    /^([a-z][a-z0-9-]*)=([^\r\n]*)/gm,
    (line, key: string) => {
      if (!remaining.has(key)) return line;
      const value = remaining.get(key)!;
      remaining.delete(key);
      return `${key}=${value}`;
    },
  );
  for (const [key, value] of remaining) {
    if (text && !text.endsWith("\n")) text += newline;
    text += `${key}=${value}${newline}`;
  }
  return text;
}

export function createPropertyStore(runtimeRoot: string) {
  const templateFile = join(runtimeRoot, TEMPLATE_FILE);
  function file(name: string) {
    validateWorldName(name);
    const worlds = join(runtimeRoot, "worlds");
    const world = join(worlds, name);
    if (!lstatSync(worlds).isDirectory() || !lstatSync(world).isDirectory())
      throw new WorldError("World storage must be a regular directory.", 500);
    return join(world, WORLD_PROPERTIES_FILE);
  }
  function template() {
    return existsSync(templateFile)
      ? read(templateFile)
      : readProperties(runtimeRoot);
  }
  function legacy(name: string, base: string) {
    const metadata = join(runtimeRoot, "worlds", name, ".mbs-world.json");
    if (!existsSync(metadata)) return base;
    const value: unknown = JSON.parse(read(metadata));
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("settings" in value)
    )
      throw new WorldError("Unsupported world metadata.", 500);
    return updateProperties(base, name, validateSettings(value.settings));
  }
  function overrides(name: string) {
    const path = file(name);
    let values: Record<string, string> = {};
    if (existsSync(path)) values = parseProperties(read(path));
    else if (!existsSync(templateFile)) {
      const current = readProperties(runtimeRoot);
      values = parseProperties(
        name === getWorldName(runtimeRoot) ? current : legacy(name, current),
      );
    } else if (
      existsSync(join(runtimeRoot, "worlds", name, ".mbs-world.json"))
    ) {
      const settings = settingsFromProperties(legacy(name, template()));
      values = {
        "level-seed": settings.seed,
        gamemode: settings.gameMode,
        difficulty: settings.difficulty,
      };
    }
    delete values["level-name"];
    return values;
  }
  function render(name: string, values = overrides(name), base = template()) {
    const text = mergeProperties(base, { ...values, "level-name": name });
    settingsFromProperties(text);
    return text;
  }
  function save(name: string, values: Record<string, string>) {
    atomicWrite(
      file(name),
      Object.entries(values)
        .filter(([key]) => key !== "level-name")
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
  }
  function migrate() {
    if (existsSync(templateFile)) return;
    const current = readProperties(runtimeRoot);
    settingsFromProperties(current);
    parseProperties(current);
    const profiles = readdirSync(join(runtimeRoot, "worlds"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .filter(
        (entry) =>
          entry.name === getWorldName(runtimeRoot) ||
          existsSync(
            join(runtimeRoot, "worlds", entry.name, "db", "CURRENT"),
          ) ||
          existsSync(
            join(runtimeRoot, "worlds", entry.name, ".mbs-world.json"),
          ) ||
          existsSync(file(entry.name)),
      )
      .map((entry) => {
        const path = file(entry.name);
        const text = existsSync(path)
          ? read(path)
          : entry.name === getWorldName(runtimeRoot)
            ? current
            : legacy(entry.name, current);
        const values = parseProperties(text);
        delete values["level-name"];
        return { name: entry.name, values };
      });
    // Write the marker last so an interrupted migration can be retried.
    for (const profile of profiles) save(profile.name, profile.values);
    atomicWrite(templateFile, current);
  }
  function describe(name: string): WorldProperties {
    const base = template();
    const defaults = parseProperties(base);
    for (const match of base.matchAll(/^# ?([a-z][a-z0-9-]*)=([^\r\n]*)$/gm)) {
      if (!Object.hasOwn(defaults, match[1])) defaults[match[1]] = match[2];
    }
    delete defaults["level-name"];
    const values = overrides(name);
    const active = name === getWorldName(runtimeRoot);
    return {
      name,
      defaults,
      overrides: values,
      templateAvailable: existsSync(templateFile),
      revision: createHash("sha256")
        .update(
          JSON.stringify([
            base,
            values,
            active,
            active ? readProperties(runtimeRoot) : null,
          ]),
        )
        .digest("hex"),
    };
  }
  function installTemplate(contents: string | Buffer) {
    const text = contents.toString();
    parseProperties(text);
    settingsFromProperties(text);
    const name = getWorldName(runtimeRoot);
    migrate();
    const previous = readProperties(runtimeRoot);
    const oldTemplate = readBytes(templateFile);
    const values = overrides(name);
    const next = render(name, values, text);
    save(name, values);
    try {
      atomicWrite(templateFile, contents);
      atomicWrite(join(runtimeRoot, "server.properties"), next);
    } catch (error) {
      atomicWrite(templateFile, oldTemplate);
      atomicWrite(join(runtimeRoot, "server.properties"), previous);
      throw error;
    }
  }
  return {
    template,
    overrides,
    render,
    save,
    migrate,
    describe,
    installTemplate,
    has: (name: string) => existsSync(file(name)),
  };
}
