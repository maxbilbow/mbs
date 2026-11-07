import type {
  PluginRelease,
  PluginSource,
  PluginSourceInput,
} from "../../model/PluginUpdates.ts";

export class PluginUpdateError extends Error {
  readonly expose = true;
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function validateSource(value: unknown): PluginSourceInput {
  if (
    !record(value) ||
    !Array.isArray(value.uuids) ||
    !value.uuids.length ||
    !value.uuids.every((uuid) => typeof uuid === "string" && UUID.test(uuid))
  ) {
    throw new PluginUpdateError(
      "Select the installed packs belonging to this source.",
    );
  }
  if (typeof value.url !== "string" || value.url.length > 1000)
    throw new PluginUpdateError("Enter a source project URL.");
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    throw new PluginUpdateError("Enter a valid HTTPS project URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new PluginUpdateError(
      "Source URLs must use HTTPS without credentials or a custom port.",
    );
  let provider: PluginSourceInput["provider"];
  if (
    value.provider === "github" &&
    url.hostname === "github.com" &&
    /^\/[a-z\d_.-]+\/[a-z\d_.-]+(?:\/releases(?:\/.*)?)?\/?$/i.test(
      url.pathname,
    )
  ) {
    provider = "github";
    url = new URL(
      `https://github.com/${url.pathname.split("/").slice(1, 3).join("/")}`,
    );
  } else if (
    value.provider === "curseforge" &&
    url.hostname === "www.curseforge.com" &&
    /^\/minecraft-bedrock\/[a-z-]+\/[a-z\d-]+\/?$/i.test(url.pathname)
  ) {
    provider = "curseforge";
    if (!Number.isSafeInteger(value.projectId) || Number(value.projectId) <= 0)
      throw new PluginUpdateError(
        "Enter CurseForge's numeric project ID (shown on the project page).",
      );
    url.search = "";
    url.hash = "";
  } else {
    throw new PluginUpdateError(
      "Use a GitHub repository or CurseForge Minecraft Bedrock project URL.",
    );
  }
  for (const key of ["assetName", "installedRelease"] as const) {
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" ||
        !value[key].trim() ||
        value[key].length > 200 ||
        /[\x00-\x1f\x7f]/.test(value[key]))
    )
      throw new PluginUpdateError(`Invalid ${key}.`);
  }
  if (
    provider === "curseforge" &&
    value.installedRelease !== undefined &&
    !/^[1-9]\d*$/.test(String(value.installedRelease).trim())
  )
    throw new PluginUpdateError(
      "CurseForge's installed release must be a numeric file ID.",
    );
  return {
    provider,
    url: url.href.replace(/\/$/, ""),
    uuids: [...new Set(value.uuids.map((uuid: string) => uuid.toLowerCase()))],
    ...(provider === "curseforge"
      ? { projectId: Number(value.projectId) }
      : {}),
    ...(value.assetName ? { assetName: String(value.assetName).trim() } : {}),
    ...(value.installedRelease
      ? { installedRelease: String(value.installedRelease).trim() }
      : {}),
  };
}

export const MAX_DOWNLOAD = 64 * 1024 * 1024;
const ARCHIVE = /\.(mcpack|mcaddon|zip)$/i;

function allowedRemote(url: URL, api: boolean) {
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return false;
  return api
    ? ["api.github.com", "api.curseforge.com"].includes(url.hostname)
    : [
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
        "files.forgecdn.net",
        "mediafilez.forgecdn.net",
        "edge.forgecdn.net",
      ].includes(url.hostname);
}

export function createPluginProviders(
  fetcher: typeof fetch = fetch,
  apiKey = process.env.CURSEFORGE_API_KEY,
) {
  async function bytes(url: string, api = false): Promise<Buffer> {
    let target = new URL(url);
    const signal = AbortSignal.timeout(60_000);
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!allowedRemote(target, api))
        throw new PluginUpdateError(
          "The provider returned an unsupported download host.",
        );
      const response = await fetcher(target, {
        redirect: "manual",
        signal,
        headers: {
          "User-Agent": "MBS-plugin-manager",
          ...(api ? { Accept: "application/json" } : {}),
          ...(api && target.hostname === "api.curseforge.com" && apiKey
            ? { "x-api-key": apiKey }
            : {}),
        },
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location)
          throw new PluginUpdateError("Provider redirect has no destination.");
        target = new URL(location, target);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new PluginUpdateError(
          `Provider request failed (HTTP ${response.status}); check API access, rate limits, and the project.`,
        );
      }
      const limit = api ? 2 * 1024 * 1024 : MAX_DOWNLOAD;
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel();
        throw new PluginUpdateError(
          "Provider response exceeds the size limit.",
        );
      }
      if (!response.body)
        throw new PluginUpdateError("Provider returned an empty response.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > limit)
            throw new PluginUpdateError(
              "Provider response exceeds the size limit.",
            );
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return Buffer.concat(chunks);
    }
    throw new PluginUpdateError("Provider returned too many redirects.");
  }

  async function json(url: string): Promise<unknown> {
    const body = await bytes(url, true);
    try {
      return JSON.parse(body.toString("utf8"));
    } catch {
      throw new PluginUpdateError("Provider returned invalid JSON.");
    }
  }

  async function latest(source: PluginSource): Promise<PluginRelease> {
    if (source.provider === "github") {
      const repository = new URL(source.url).pathname;
      const body = await json(
        `https://api.github.com/repos${repository}/releases/latest`,
      );
      if (
        !record(body) ||
        typeof body.tag_name !== "string" ||
        typeof body.html_url !== "string" ||
        !Array.isArray(body.assets) ||
        body.draft === true ||
        body.prerelease === true
      )
        throw new PluginUpdateError("GitHub returned an unsupported release.");
      const assets = body.assets.filter(
        (asset) =>
          record(asset) &&
          typeof asset.name === "string" &&
          ARCHIVE.test(asset.name) &&
          (!source.assetName || asset.name === source.assetName),
      );
      const asset =
        assets.length === 1 && record(assets[0]) ? assets[0] : undefined;
      return {
        id: body.tag_name,
        name:
          typeof body.name === "string" && body.name
            ? body.name
            : body.tag_name,
        url: `${source.url}/releases/tag/${encodeURIComponent(body.tag_name)}`,
        ...(asset && typeof asset.browser_download_url === "string"
          ? {
              downloadUrl: asset.browser_download_url,
              fileName: String(asset.name),
              ...(typeof asset.digest === "string" &&
              /^sha256:[a-f\d]{64}$/i.test(asset.digest)
                ? { sha256: asset.digest.slice(7) }
                : {}),
            }
          : {}),
      };
    }
    if (!apiKey)
      throw new PluginUpdateError(
        "Configure CURSEFORGE_API_KEY in the server's .env file after obtaining an approved API key. Manual archive import is available without a key.",
      );
    const project = await json(
      `https://api.curseforge.com/v1/mods/${source.projectId}`,
    );
    if (
      !record(project) ||
      !record(project.data) ||
      !record(project.data.links) ||
      typeof project.data.links.websiteUrl !== "string" ||
      new URL(project.data.links.websiteUrl).pathname.replace(/\/$/, "") !==
        new URL(source.url).pathname.replace(/\/$/, "")
    )
      throw new PluginUpdateError(
        "The CurseForge project ID does not match this Bedrock project URL.",
      );
    const response = await json(
      `https://api.curseforge.com/v1/mods/${source.projectId}/files?pageSize=50`,
    );
    if (!record(response) || !Array.isArray(response.data))
      throw new PluginUpdateError("CurseForge returned an invalid file list.");
    const files = response.data.filter(
      (file) =>
        record(file) &&
        file.isAvailable === true &&
        file.releaseType === 1 &&
        typeof file.fileName === "string" &&
        ARCHIVE.test(file.fileName) &&
        (!source.assetName || file.fileName === source.assetName),
    );
    files.sort((a, b) => Number(b.id) - Number(a.id));
    const file = files[0];
    if (!record(file) || !Number.isSafeInteger(file.id))
      throw new PluginUpdateError(
        "No supported stable archive found in the latest 50 CurseForge files. Use manual import for other releases.",
      );
    return {
      id: String(file.id),
      name:
        typeof file.displayName === "string"
          ? file.displayName
          : String(file.fileName),
      url: `${source.url}/files/${file.id}`,
      fileName: String(file.fileName),
      ...(project.data.allowModDistribution === true &&
      typeof file.downloadUrl === "string"
        ? { downloadUrl: file.downloadUrl }
        : {}),
    };
  }
  return {
    latest,
    download: async (url: string) => {
      try {
        return await bytes(url);
      } catch (error) {
        if (error instanceof PluginUpdateError) throw error;
        throw new PluginUpdateError(
          `Download failed: ${error instanceof Error ? error.message : "unable to contact provider"}. Check connectivity and try again.`,
          500,
        );
      }
    },
    configured: !!apiKey,
  };
}
