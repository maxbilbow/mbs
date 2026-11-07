import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { BEDROCK_ROOT } from "../../../scripts/paths.ts";
import {
  PERMISSIONS,
  type Permission,
  type UserInfo,
  type UserList,
} from "../../model/Users.ts";
import {
  atomicWrite,
  getWorldName,
  readProperties,
  validateWorldName,
  WorldError,
} from "./WorldProperties.ts";

interface Assignment {
  xuid: string;
  permission: Permission;
}
interface Identity {
  xuid: string;
  username: string | null;
  alias: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validXuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9]\d{0,19}$/.test(value) &&
    BigInt(value) <= 18446744073709551615n
  );
}

function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 100 &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}

function permission(value: unknown): Permission {
  const result = PERMISSIONS.find((item) => item === value);
  if (!result) throw new WorldError("Invalid player permission.");
  return result;
}

function readJson(file: string): unknown {
  if (!lstatSync(file).isFile())
    throw new WorldError("User configuration must be a regular file.", 500);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new WorldError("User configuration contains invalid JSON.", 500);
    throw error;
  }
}

function assignments(value: unknown): Assignment[] {
  if (!Array.isArray(value))
    throw new WorldError("Permissions must be an array.", 500);
  const seen = new Set<string>();
  return value.map((entry: unknown) => {
    if (!record(entry) || !validXuid(entry.xuid) || seen.has(entry.xuid))
      throw new WorldError("Invalid or duplicate XUID in permissions.", 500);
    seen.add(entry.xuid);
    const role = PERMISSIONS.find((item) => item === entry.permission);
    if (!role) throw new WorldError("Invalid stored player permission.", 500);
    return { xuid: entry.xuid, permission: role };
  });
}

export function createUserStore(
  runtimeRoot = BEDROCK_ROOT,
  logFile = resolve(runtimeRoot, "../logs/bedrock.log"),
) {
  const registryFile = join(runtimeRoot, ".mbs-users.json");
  const runtimeFile = join(runtimeRoot, "permissions.json");
  let logIdentity = "";
  let logOffset = 0;
  let partial = "";
  let decoder = new StringDecoder("utf8");

  function worldFile(world: string) {
    validateWorldName(world);
    const worldsRoot = join(runtimeRoot, "worlds");
    if (!lstatSync(worldsRoot).isDirectory())
      throw new WorldError("World storage must be a regular directory.", 500);
    const path = join(worldsRoot, world);
    if (!existsSync(path)) throw new WorldError("World not found.", 404);
    if (!lstatSync(path).isDirectory())
      throw new WorldError("World must be a regular directory.");
    return join(path, ".mbs-permissions.json");
  }

  function runtimePermissions() {
    return existsSync(runtimeFile) ? assignments(readJson(runtimeFile)) : [];
  }

  function savedPermissions(world: string) {
    const file = worldFile(world);
    if (!existsSync(file)) return [];
    const value = readJson(file);
    if (!record(value) || value.version !== 1)
      throw new WorldError("Unsupported world permissions.", 500);
    return assignments(value.permissions);
  }

  function savePermissions(world: string, entries: Assignment[]) {
    atomicWrite(
      worldFile(world),
      JSON.stringify({ version: 1, permissions: entries }, null, 2) + "\n",
    );
  }

  function identities(): Identity[] {
    if (!existsSync(registryFile)) return [];
    const value = readJson(registryFile);
    if (!record(value) || value.version !== 1 || !Array.isArray(value.users))
      throw new WorldError("Unsupported user registry.", 500);
    const seen = new Set<string>();
    return value.users.map((entry: unknown) => {
      if (
        !record(entry) ||
        !validXuid(entry.xuid) ||
        seen.has(entry.xuid) ||
        !validName(entry.alias) ||
        !(entry.username === null || validName(entry.username))
      )
        throw new WorldError("Invalid user registry.", 500);
      seen.add(entry.xuid);
      return { xuid: entry.xuid, alias: entry.alias, username: entry.username };
    });
  }

  function saveIdentities(users: Identity[]) {
    const content = JSON.stringify({ version: 1, users }, null, 2) + "\n";
    if (
      !existsSync(registryFile) ||
      readFileSync(registryFile, "utf8") !== content
    )
      atomicWrite(registryFile, content);
  }

  function initialize() {
    identities();
    const world = getWorldName(runtimeRoot);
    const file = worldFile(world);
    // The first managed world owns the pre-existing server-wide assignments.
    if (!existsSync(registryFile) && !existsSync(file))
      savePermissions(world, runtimePermissions());
    savedPermissions(world);
  }

  function discover(worlds: string[]) {
    initialize();
    const users = identities();
    const known = new Map(users.map((user) => [user.xuid, user]));
    function observe(xuid: string, username: string | null = null) {
      let user = known.get(xuid);
      if (!user) {
        user = { xuid, username, alias: "" };
        users.push(user);
        known.set(xuid, user);
      } else if (username !== null) {
        user.username = username;
      }
    }
    for (const entry of runtimePermissions()) observe(entry.xuid);
    for (const world of worlds)
      for (const entry of savedPermissions(world)) observe(entry.xuid);
    const allowlistFile = join(runtimeRoot, "allowlist.json");
    if (existsSync(allowlistFile)) {
      const entries = readJson(allowlistFile);
      if (!Array.isArray(entries))
        throw new WorldError("Allowlist must be an array.", 500);
      for (const entry of entries) {
        if (
          !record(entry) ||
          (entry.xuid !== undefined &&
            entry.xuid !== "" &&
            !validXuid(entry.xuid)) ||
          (entry.name !== undefined && !validName(entry.name))
        )
          throw new WorldError("Invalid allowlist entry.", 500);
        if (validXuid(entry.xuid))
          observe(
            entry.xuid,
            !known.get(entry.xuid)?.username &&
              typeof entry.name === "string" &&
              entry.name
              ? entry.name
              : null,
          );
      }
    }
    if (existsSync(logFile)) {
      if (!lstatSync(logFile).isFile())
        throw new WorldError("Player log must be a regular file.", 500);
      const fd = openSync(logFile, "r");
      try {
        const stat = fstatSync(fd);
        const identity = `${stat.dev}:${stat.ino}`;
        if (identity !== logIdentity || stat.size < logOffset) {
          logOffset = 0;
          partial = "";
          decoder = new StringDecoder("utf8");
          logIdentity = identity;
        }
        const buffer = Buffer.alloc(64 * 1024);
        while (logOffset < stat.size) {
          const length = readSync(
            fd,
            buffer,
            0,
            Math.min(buffer.length, stat.size - logOffset),
            logOffset,
          );
          if (!length) break;
          logOffset += length;
          const lines = (
            partial + decoder.write(buffer.subarray(0, length))
          ).split("\n");
          partial = lines.pop()!;
          for (const line of lines) {
            const match =
              /Player (?:connected|disconnected|Spawned): (.+?)(?:,)? xuid: ([0-9]+)(?:,|[\r ]*$)/.exec(
                line,
              );
            if (match && validXuid(match[2]) && validName(match[1]))
              observe(match[2], match[1]);
          }
          if (partial.length > 64 * 1024)
            throw new WorldError("Player log contains an oversized line.", 500);
        }
        saveIdentities(users);
      } catch (error) {
        // Replay rather than lose discoveries when a registry write fails.
        logOffset = 0;
        partial = "";
        decoder = new StringDecoder("utf8");
        throw error;
      } finally {
        closeSync(fd);
      }
    } else {
      saveIdentities(users);
    }
    return users;
  }

  function list(worlds: string[]): UserList {
    const identities = discover(worlds);
    const activeWorld = getWorldName(runtimeRoot);
    const text = readProperties(runtimeRoot);
    const defaults = [
      ...text.matchAll(/^default-player-permission-level=([^\r\n]*)/gm),
    ];
    if (defaults.length > 1)
      throw new WorldError("Duplicate default player permission.", 500);
    const defaultPermission = defaults.length
      ? permission(defaults[0][1])
      : "member";
    const users: UserInfo[] = identities.map((user) => ({
      ...user,
      permissions: {},
    }));
    const byXuid = new Map(users.map((user) => [user.xuid, user]));
    for (const world of worlds) {
      const entries =
        world === activeWorld ? runtimePermissions() : savedPermissions(world);
      for (const entry of entries) {
        const user = byXuid.get(entry.xuid);
        if (user)
          Object.defineProperty(user.permissions, world, {
            value: entry.permission,
            enumerable: true,
          });
      }
    }
    return { activeWorld, defaultPermission, worlds, users };
  }

  function update(value: unknown, worlds: string[]) {
    if (
      !record(value) ||
      !validXuid(value.xuid) ||
      !validName(value.alias) ||
      value.alias !== value.alias.trim()
    )
      throw new WorldError(
        "Enter a valid XUID and alias (up to 100 characters).",
      );
    validateWorldName(value.world);
    if (!worlds.includes(value.world))
      throw new WorldError("World not found.", 404);
    const role =
      value.permission === null ? null : permission(value.permission);
    const users = discover(worlds);
    let user = users.find((user) => user.xuid === value.xuid);
    if (!user) {
      user = { xuid: value.xuid, alias: "", username: null };
      users.push(user);
    }
    const active = value.world === getWorldName(runtimeRoot);
    const previous = active
      ? runtimePermissions()
      : savedPermissions(value.world);
    const next = previous.filter((entry) => entry.xuid !== value.xuid);
    if (role) next.push({ xuid: value.xuid, permission: role });
    const previousAlias = user.alias;
    user.alias = value.alias;
    saveIdentities(users);
    try {
      if (active)
        atomicWrite(runtimeFile, JSON.stringify(next, null, 2) + "\n");
      else savePermissions(value.world, next);
    } catch (error) {
      user.alias = previousAlias;
      saveIdentities(users);
      throw error;
    }
    return list(worlds);
  }

  function prepareSwitch(from: string, to: string) {
    initialize();
    // Persist the import marker even if no users have been discovered yet.
    saveIdentities(identities());
    const previous = existsSync(runtimeFile)
      ? readFileSync(runtimeFile, "utf8")
      : null;
    const outgoing = runtimePermissions();
    const incoming = savedPermissions(to);
    return {
      apply() {
        const current = existsSync(runtimeFile)
          ? readFileSync(runtimeFile, "utf8")
          : null;
        if (current !== previous)
          throw new WorldError(
            "Server permissions changed during switching.",
            409,
          );
        savePermissions(from, outgoing);
        atomicWrite(runtimeFile, JSON.stringify(incoming, null, 2) + "\n");
      },
      restore() {
        if (previous === null) {
          if (existsSync(runtimeFile)) unlinkSync(runtimeFile);
        } else atomicWrite(runtimeFile, previous);
      },
    };
  }

  return { list, update, prepareSwitch };
}
