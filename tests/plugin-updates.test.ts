import assert from "node:assert/strict";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { crc32, deflateRawSync } from "node:zlib";
import { test } from "node:test";
import { createApp } from "../App/server/app.ts";
import { createPluginStore } from "../App/server/data/Plugins.ts";
import { createPluginUpdateStore } from "../App/server/data/PluginUpdates.ts";
import {
  createPluginProviders,
  MAX_DOWNLOAD,
  record,
  validateSource,
} from "../App/server/data/PluginSources.ts";
import { inspectArchive } from "../App/server/data/PluginArchives.ts";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import type { PluginSource } from "../App/model/PluginUpdates.ts";

const BP = "597d3dd8-5075-4785-96ef-36ed2359a2b9";
const RP = "ad896147-cd2a-4e34-ae39-1ecf173a2b92";

type ZipEntry = {
  name: string;
  bytes: Buffer;
  mode?: number;
  size?: number;
  crc?: number;
};

function zip(entries: ZipEntry[]) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = deflateRawSync(entry.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(entry.crc ?? crc32(entry.bytes), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(entry.size ?? entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(0x0314, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(entry.crc ?? crc32(entry.bytes), 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(entry.size ?? entry.bytes.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    central.push(record, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function manifest(
  uuid = BP,
  type = "data",
  version = [1, 0, 0],
  dependencies: unknown[] = [],
) {
  return {
    format_version: 2,
    header: {
      uuid,
      name: "Fixture pack",
      description: "Fixture",
      version,
      min_engine_version: [1, 21, 90],
    },
    modules: [{ uuid: randomUUID(), type, version }],
    dependencies,
  };
}

function archive(version = [2, 0, 0], companion = false) {
  return zip([
    {
      name: "random-folder/bp/manifest.json",
      bytes: Buffer.from(
        JSON.stringify(
          manifest(
            BP,
            "data",
            version,
            companion ? [{ uuid: RP, version }] : [],
          ),
        ),
      ),
    },
    { name: "random-folder/bp/asset.txt", bytes: Buffer.from("new contents") },
    ...(companion
      ? [
          {
            name: "other-folder/rp/manifest.json",
            bytes: Buffer.from(
              JSON.stringify(manifest(RP, "resources", version)),
            ),
          },
        ]
      : []),
  ]);
}

function fixture(running = false) {
  const root = mkdtempSync(join(tmpdir(), "mbs-plugin-updates-"));
  for (const dir of [
    "development_behavior_packs/old-bp",
    "development_resource_packs/old-rp",
    "worlds/First",
    "worlds/Other",
  ])
    mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, "server.properties"), "level-name=First\n");
  writeFileSync(
    join(root, "development_behavior_packs/old-bp/manifest.json"),
    JSON.stringify(manifest()),
  );
  writeFileSync(
    join(root, "development_behavior_packs/old-bp/asset.txt"),
    "old contents",
  );
  writeFileSync(
    join(root, "development_resource_packs/old-rp/manifest.json"),
    JSON.stringify(manifest(RP, "resources")),
  );
  for (const world of ["First", "Other"]) {
    writeFileSync(
      join(root, `worlds/${world}/world_behavior_packs.json`),
      JSON.stringify([{ pack_id: BP, version: [1, 0, 0] }]),
    );
    writeFileSync(
      join(root, `worlds/${world}/world_resource_packs.json`),
      JSON.stringify([{ pack_id: RP, version: [1, 0, 0] }]),
    );
  }
  let active = running;
  const calls: string[] = [];
  const control = {
    getStatus: () => ({
      version: "1.21.100.1",
      status: active ? "active" : "stopped",
    }),
    stop: async () => {
      calls.push("stop");
      active = false;
    },
    start: async () => {
      calls.push("start");
      active = true;
    },
    restart: async () => {},
  };
  return {
    root,
    control,
    calls,
    cleanup: () => rmSync(root, { recursive: true }),
  };
}

function source(uuids = [BP]): PluginSource {
  return {
    id: randomUUID(),
    provider: "github",
    url: "https://github.com/fixture/packs",
    uuids,
    installedRelease: "v1",
  };
}

test("archive import accepts nested mcaddon and inconsistent companion folders", async () => {
  const f = fixture();
  try {
    const nested = zip([
      {
        name: "download.mcaddon",
        bytes: zip([
          {
            name: "bp.mcpack",
            bytes: zip([
              {
                name: "manifest.json",
                bytes: Buffer.from(JSON.stringify(manifest())),
              },
            ]),
          },
          {
            name: "resources.zip",
            bytes: zip([
              {
                name: "odd name/manifest.json",
                bytes: Buffer.from(JSON.stringify(manifest(RP, "resources"))),
              },
            ]),
          },
        ]),
      },
    ]);
    const packs = await inspectArchive(nested, join(f.root, "inspect"));
    assert.deepEqual(
      packs.map((pack) => [pack.uuid, pack.type]),
      [
        [BP, "behaviour"],
        [RP, "resource"],
      ],
    );
    assert.ok(existsSync(join(f.root, "inspect", RP, "manifest.json")));
  } finally {
    f.cleanup();
  }
});

test("archive extraction rejects traversal, links, duplicates, bad checksums and exact size limits", async () => {
  const f = fixture();
  try {
    for (const entries of [
      [{ name: "../outside", bytes: Buffer.from("bad") }],
      [{ name: "/absolute", bytes: Buffer.from("bad") }],
      [{ name: "a\\b", bytes: Buffer.from("bad") }],
      [{ name: "symlink", bytes: Buffer.from("/tmp"), mode: 0o120777 }],
      [
        { name: "a", bytes: Buffer.from("one") },
        { name: "A", bytes: Buffer.from("two") },
      ],
      [{ name: "bad.txt", bytes: Buffer.from("bad"), crc: 0 }],
      [
        {
          name: "bomb",
          bytes: Buffer.from("tiny"),
          size: 256 * 1024 * 1024 + 1,
        },
      ],
    ]) {
      await assert.rejects(
        inspectArchive(zip(entries), join(f.root, randomUUID())),
      );
    }
    await assert.rejects(
      inspectArchive(Buffer.alloc(MAX_DOWNLOAD + 1), join(f.root, "oversize")),
      /64 MiB/,
    );
    const tooMany = Array.from({ length: 10_001 }, (_, i) => ({
      name: `f${i}`,
      bytes: Buffer.alloc(0),
    }));
    await assert.rejects(
      inspectArchive(zip(tooMany), join(f.root, "entries")),
      /exceeds extraction limits/,
    );
    let nested = archive();
    for (let i = 0; i < 4; i++)
      nested = zip([{ name: "nested.zip", bytes: nested }]);
    await assert.rejects(
      inspectArchive(nested, join(f.root, "depth")),
      /three levels/,
    );
  } finally {
    f.cleanup();
  }
});

test("archives reject invalid manifests, multiple versions, mixed modules and missing script entries", async () => {
  const f = fixture();
  try {
    for (const files of [
      [{ name: "manifest.json", bytes: Buffer.from("{}") }],
      [{ name: "manifest.json", bytes: Buffer.from("invalid json") }],
      [
        {
          name: "a/manifest.json",
          bytes: Buffer.from(JSON.stringify(manifest())),
        },
        {
          name: "b/manifest.json",
          bytes: Buffer.from(JSON.stringify(manifest())),
        },
      ],
      [
        {
          name: "manifest.json",
          bytes: Buffer.from(
            JSON.stringify({
              ...manifest(),
              modules: [
                ...manifest().modules,
                ...manifest(RP, "resources").modules,
              ],
            }),
          ),
        },
      ],
      [
        {
          name: "manifest.json",
          bytes: Buffer.from(
            JSON.stringify({
              ...manifest(),
              modules: [
                {
                  uuid: randomUUID(),
                  type: "script",
                  version: [1, 0, 0],
                  language: "javascript",
                  entry: "scripts/main.js",
                },
              ],
            }),
          ),
        },
      ],
    ])
      await assert.rejects(
        inspectArchive(zip(files), join(f.root, randomUUID())),
      );
  } finally {
    f.cleanup();
  }
});

test("archive validation enforces header display fields and distinct module UUIDs", async () => {
  const f = fixture();
  try {
    for (const value of [
      { ...manifest(), header: { uuid: BP, version: [1, 0, 0] } },
      {
        ...manifest(),
        header: { ...manifest().header, name: { invalid: true } },
      },
      {
        ...manifest(),
        modules: [{ uuid: BP, version: [1, 0, 0], type: "data" }],
      },
    ]) {
      await assert.rejects(
        inspectArchive(
          zip([
            {
              name: "manifest.json",
              bytes: Buffer.from(JSON.stringify(value)),
            },
          ]),
          join(f.root, randomUUID()),
        ),
      );
    }
    const packs = Array.from({ length: 33 }, (_, index) => ({
      name: `p${index}/manifest.json`,
      bytes: Buffer.from(JSON.stringify(manifest(randomUUID()))),
    }));
    assert.equal(
      (await inspectArchive(zip(packs.slice(0, 32)), join(f.root, "limit")))
        .length,
      32,
    );
    await assert.rejects(
      inspectArchive(zip(packs), join(f.root, "over-limit")),
      /more than 32/,
    );
  } finally {
    f.cleanup();
  }
});

test("source links persist, reject overlaps, and normalize project URLs", () => {
  const f = fixture();
  try {
    const store = createPluginUpdateStore(f.root, f.control);
    const input = source();
    const result = store.link({
      ...input,
      url: "https://github.com/fixture/packs/releases/tag/v2",
    });
    assert.equal(result.sources[0].url, input.url);
    assert.equal(
      createPluginUpdateStore(f.root, f.control).list().sources.length,
      1,
    );
    assert.throws(() => store.link(input), /already belongs/);
    assert.throws(
      () => store.link({ ...input, uuids: [randomUUID()] }),
      /installed pack/,
    );
    assert.throws(
      () =>
        validateSource({ ...input, url: "http://github.com/fixture/packs" }),
      /HTTPS/,
    );
    assert.throws(
      () =>
        validateSource({
          ...input,
          url: "https://github.com.evil.test/fixture/packs",
        }),
      /project URL/,
    );
    store.unlink(result.sources[0].id);
    assert.equal(store.list().sources.length, 0);
  } finally {
    f.cleanup();
  }
});

test("GitHub checks select exact stable archive assets and reject unsafe download redirects", async () => {
  const release = {
    tag_name: "v2",
    name: "Version 2",
    html_url: "https://github.com/fixture/packs/releases/tag/v2",
    draft: false,
    prerelease: false,
    assets: [
      {
        name: "packs.mcaddon",
        browser_download_url:
          "https://github.com/fixture/packs/releases/download/v2/packs.mcaddon",
        digest: `sha256:${"a".repeat(64)}`,
      },
      {
        name: "other.zip",
        browser_download_url:
          "https://github.com/fixture/packs/releases/download/v2/other.zip",
      },
    ],
  };
  const providers = createPluginProviders(async () => Response.json(release));
  assert.equal((await providers.latest(source())).downloadUrl, undefined);
  const selected = await providers.latest({
    ...source(),
    assetName: "packs.mcaddon",
  });
  assert.equal(selected.fileName, "packs.mcaddon");
  assert.equal(selected.sha256, "a".repeat(64));
  const requests: string[] = [];
  const redirect = createPluginProviders(async (url) => {
    requests.push(String(url));
    return new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" },
    });
  });
  await assert.rejects(
    redirect.download(selected.downloadUrl!),
    /unsupported download host/,
  );
  assert.equal(requests.length, 1);
  await assert.rejects(
    redirect.download("https://evil.test/pack.zip"),
    /unsupported download host/,
  );
  const oversized = createPluginProviders(
    async () =>
      new Response("tiny", {
        headers: { "content-length": String(MAX_DOWNLOAD + 1) },
      }),
  );
  await assert.rejects(oversized.download(selected.downloadUrl!), /size limit/);
});

test("CurseForge reports missing configuration, validates Bedrock project IDs, and respects distribution", async () => {
  const cf: PluginSource = {
    ...source(),
    provider: "curseforge",
    url: "https://www.curseforge.com/minecraft-bedrock/addons/fixture",
    projectId: 123,
  };
  await assert.rejects(
    createPluginProviders(fetch, "").latest(cf),
    /CURSEFORGE_API_KEY/,
  );
  const headers: Headers[] = [];
  const providers = createPluginProviders(async (url, init) => {
    headers.push(new Headers(init?.headers));
    if (String(url).endsWith("/123"))
      return Response.json({
        data: { links: { websiteUrl: cf.url }, allowModDistribution: false },
      });
    return Response.json({
      data: [
        {
          id: 2,
          isAvailable: true,
          releaseType: 1,
          fileName: "pack.mcaddon",
          downloadUrl: "https://files.forgecdn.net/pack.mcaddon",
        },
        { id: 3, isAvailable: true, releaseType: 2, fileName: "beta.mcaddon" },
      ],
    });
  }, "fixture-key");
  const latest = await providers.latest(cf);
  assert.equal(latest.id, "2");
  assert.equal(latest.downloadUrl, undefined);
  assert.ok(
    headers.every((header) => header.get("x-api-key") === "fixture-key"),
  );
  const wrongProject = createPluginProviders(
    async () =>
      Response.json({
        data: {
          links: {
            websiteUrl: "https://www.curseforge.com/minecraft/mc-mods/fixture",
          },
        },
      }),
    "fixture-key",
  );
  await assert.rejects(wrongProject.latest(cf), /does not match/);
});

test("update checks distinguish unknown/current/changed releases and per-source failures", async () => {
  const f = fixture();
  try {
    const providers = {
      configured: false,
      download: async () => archive(),
      latest: async () => ({ id: "v2", name: "Version 2", url: source().url }),
    };
    const store = createPluginUpdateStore(f.root, f.control, providers);
    let linked = store.link({ ...source(), installedRelease: undefined })
      .sources[0];
    assert.equal((await store.check())[0].status, "unknown");
    store.link({ ...linked, installedRelease: "v1" }, linked.id);
    assert.equal((await store.check())[0].status, "update");
    linked = store.link({ ...linked, installedRelease: "v2" }, linked.id)
      .sources[0];
    assert.equal((await store.check())[0].status, "current");
    const failure = createPluginUpdateStore(f.root, f.control, {
      ...providers,
      latest: async () => {
        throw new Error("Rate limited");
      },
    });
    assert.deepEqual(
      (await failure.check()).map(({ status, message }) => [status, message]),
      [["error", "Rate limited"]],
    );
  } finally {
    f.cleanup();
  }
});

test("staging and cancelling never stop Minecraft or alter installed packs", async () => {
  const f = fixture(true);
  try {
    const store = createPluginUpdateStore(f.root, f.control);
    const preview = await store.importArchive(archive());
    assert.equal(preview.packs[0].activates, true);
    assert.equal(preview.packs[0].replacesSameVersion, false);
    assert.deepEqual(f.calls, []);
    assert.equal(
      readFileSync(
        join(f.root, "development_behavior_packs/old-bp/asset.txt"),
        "utf8",
      ),
      "old contents",
    );
    store.cancel(preview.token);
    await assert.rejects(
      store.install(preview.token, true),
      /expired or not found/,
    );
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test("checksum failures never stage or stop, and new pack imports remain inactive", async () => {
  const f = fixture(true);
  try {
    const store = createPluginUpdateStore(f.root, f.control, {
      configured: false,
      download: async () => archive(),
      latest: async () => ({
        id: "v2",
        name: "Version 2",
        url: source().url,
        downloadUrl:
          "https://github.com/fixture/packs/releases/download/v2/packs.zip",
        sha256: "0".repeat(64),
      }),
    });
    const linked = store.link(source()).sources[0];
    await assert.rejects(store.stageUpdate(linked.id, "v2"), /checksum/);
    assert.deepEqual(f.calls, []);
    const uuid = randomUUID();
    const preview = await store.importArchive(
      zip([
        {
          name: "manifest.json",
          bytes: Buffer.from(JSON.stringify(manifest(uuid))),
        },
      ]),
    );
    assert.equal(preview.packs[0].activates, false);
    await store.install(preview.token, true);
    assert.equal(
      createPluginStore(f.root)
        .findDevelompentPlugins()
        .find((plugin) => plugin.uuid === uuid)?.versions[0].active,
      false,
    );
    assert.deepEqual(f.calls, ["stop", "start"]);
  } finally {
    f.cleanup();
  }
});

test("one-click companion update backs up, migrates current-world selections, and restores running state", async () => {
  const f = fixture(true);
  try {
    const store = createPluginUpdateStore(f.root, f.control, {
      configured: false,
      download: async () => archive([2, 0, 0], true),
      latest: async () => ({
        id: "v2",
        name: "Version 2",
        url: source().url,
        downloadUrl:
          "https://github.com/fixture/packs/releases/download/v2/packs.mcaddon",
      }),
    });
    const linked = store.link(source([BP, RP])).sources[0];
    await assert.rejects(
      store.stageUpdate(linked.id, "old"),
      /release changed/,
    );
    const preview = await store.stageUpdate(linked.id, "v2");
    await assert.rejects(
      store.install(preview.token, false),
      /explicit confirmation/,
    );
    assert.deepEqual(f.calls, []);
    const result = await store.install(preview.token, true);
    assert.deepEqual(f.calls, ["stop", "start"]);
    assert.equal(result.running, true);
    assert.ok(existsSync(join(f.root, result.backup, "receipt.json")));
    for (const kind of ["behavior", "resource"]) {
      assert.deepEqual(
        JSON.parse(
          readFileSync(
            join(f.root, `worlds/First/world_${kind}_packs.json`),
            "utf8",
          ),
        )[0].version,
        [2, 0, 0],
      );
      assert.deepEqual(
        JSON.parse(
          readFileSync(
            join(f.root, `worlds/Other/world_${kind}_packs.json`),
            "utf8",
          ),
        )[0].version,
        [1, 0, 0],
      );
    }
    assert.equal(store.list().sources[0].installedRelease, "v2");
    assert.equal((await store.check())[0].status, "current");
    assert.ok(
      existsSync(join(f.root, "development_behavior_packs/old-bp/asset.txt")),
    );
    assert.equal(
      createPluginStore(f.root).findDevelompentPlugins()[0].versions.length,
      2,
    );
  } finally {
    f.cleanup();
  }
});

test("same-version import retains backup and invalidates unassociated upstream tracking", async () => {
  const f = fixture();
  try {
    const store = createPluginUpdateStore(f.root, f.control);
    store.link(source());
    const preview = await store.importArchive(archive([1, 0, 0]));
    assert.equal(preview.packs[0].replacesSameVersion, true);
    assert.ok(
      preview.warnings.some((warning) => warning.includes("every world")),
    );
    const result = await store.install(preview.token, true);
    assert.equal(
      readFileSync(
        join(f.root, "development_behavior_packs/old-bp/asset.txt"),
        "utf8",
      ),
      "new contents",
    );
    assert.equal(
      readFileSync(join(f.root, result.backup, "pack-0/asset.txt"), "utf8"),
      "old contents",
    );
    assert.equal(store.list().sources[0].installedRelease, undefined);
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test("UUID casing is consistent across discovery, source links, and update activation", async () => {
  const f = fixture();
  try {
    writeFileSync(
      join(f.root, "development_behavior_packs/old-bp/manifest.json"),
      JSON.stringify(manifest(BP.toUpperCase())),
    );
    writeFileSync(
      join(f.root, "worlds/First/world_behavior_packs.json"),
      JSON.stringify([{ pack_id: BP.toUpperCase(), version: [1, 0, 0] }]),
    );
    const plugins = createPluginStore(f.root);
    assert.equal(
      plugins.findDevelompentPlugins().find((plugin) => plugin.uuid === BP)
        ?.versions[0].active,
      true,
    );
    const store = createPluginUpdateStore(f.root, f.control);
    const linked = store.link(source()).sources[0];
    const preview = await store.importArchive(archive(), linked.id, "v2");
    await store.install(preview.token, true);
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          join(f.root, "worlds/First/world_behavior_packs.json"),
          "utf8",
        ),
      ),
      [{ pack_id: BP, version: [2, 0, 0] }],
    );
    assert.equal(
      plugins.findDevelompentPlugins().find((plugin) => plugin.uuid === BP)
        ?.versions.length,
      2,
    );
  } finally {
    f.cleanup();
  }
});

test("tampered staging data is rejected before stopping Minecraft", async () => {
  const f = fixture(true);
  try {
    const store = createPluginUpdateStore(f.root, f.control);
    const preview = await store.importArchive(archive());
    writeFileSync(
      join(
        f.root,
        ".mbs-plugin-updates/staging",
        preview.token,
        BP,
        "asset.txt",
      ),
      "changed staged content",
    );
    await assert.rejects(store.install(preview.token, true), /changed/);
    assert.deepEqual(f.calls, []);
    store.cancel(preview.token);
  } finally {
    f.cleanup();
  }
});

test("preflight blocks unmatched UUIDs, downgrades, engine mismatches, and active dependency breakage", async () => {
  const f = fixture(true);
  try {
    const store = createPluginUpdateStore(f.root, f.control);
    const linked = store.link(source([BP, RP])).sources[0];
    await assert.rejects(
      store.importArchive(archive(), linked.id),
      /exactly the linked/,
    );
    await assert.rejects(store.importArchive(archive([0, 9, 0])), /downgrade/);
    const newerEngine = {
      ...manifest(),
      header: { ...manifest().header, min_engine_version: [1, 99, 0] },
    };
    await assert.rejects(
      store.importArchive(
        zip([
          {
            name: "manifest.json",
            bytes: Buffer.from(JSON.stringify(newerEngine)),
          },
        ]),
      ),
      /requires Bedrock/,
    );
    const broken = manifest(
      BP,
      "data",
      [2, 0, 0],
      [{ uuid: RP, version: [2, 0, 0] }],
    );
    await assert.rejects(
      store.importArchive(
        zip([
          { name: "manifest.json", bytes: Buffer.from(JSON.stringify(broken)) },
        ]),
      ),
      /missing pack/,
    );
    const reverse = manifest(
      RP,
      "resources",
      [1, 0, 0],
      [{ uuid: BP, version: [1, 0, 0] }],
    );
    writeFileSync(
      join(f.root, "development_resource_packs/old-rp/manifest.json"),
      JSON.stringify(reverse),
    );
    await assert.rejects(
      store.importArchive(archive()),
      /active pack dependency/,
    );
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});

test("changed configuration cancels installation and never starts an unexpected world", async () => {
  const f = fixture(true);
  try {
    const store = createPluginUpdateStore(f.root, f.control);
    const preview = await store.importArchive(archive());
    const stop = f.control.stop;
    f.control.stop = async () => {
      await stop();
      writeFileSync(join(f.root, "server.properties"), "level-name=Other\n");
    };
    await assert.rejects(
      store.install(preview.token, true),
      /changed during shutdown.*left stopped/,
    );
    assert.deepEqual(f.calls, ["stop"]);
    assert.equal(
      readFileSync(
        join(f.root, "development_behavior_packs/old-bp/asset.txt"),
        "utf8",
      ),
      "old contents",
    );
  } finally {
    f.cleanup();
  }
});

test("startup failure restores original pack files, selections, and upstream metadata", async () => {
  const f = fixture(true);
  try {
    let starts = 0;
    const start = f.control.start;
    f.control.start = async () => {
      if (++starts === 1) {
        f.calls.push("start-failed");
        throw new Error("Fixture start failed");
      }
      await start();
    };
    const store = createPluginUpdateStore(f.root, f.control);
    const linked = store.link(source()).sources[0];
    const preview = await store.importArchive(
      archive([1, 0, 0]),
      linked.id,
      "v2",
    );
    await assert.rejects(
      store.install(preview.token, true),
      /Fixture start failed.*Previous packs.*restored/,
    );
    assert.deepEqual(f.calls, ["stop", "start-failed", "stop", "start"]);
    assert.equal(
      readFileSync(
        join(f.root, "development_behavior_packs/old-bp/asset.txt"),
        "utf8",
      ),
      "old contents",
    );
    assert.equal(store.list().sources[0].installedRelease, "v1");
    assert.equal(f.control.getStatus().status, "active");
  } finally {
    f.cleanup();
  }
});

test("shutdown and rollback failures remain explicit without success-shaped responses", async () => {
  const f = fixture(true);
  try {
    const store = createPluginUpdateStore(f.root, f.control);
    const preview = await store.importArchive(archive());
    f.control.stop = async () => {
      throw new Error("Fixture shutdown failed");
    };
    await assert.rejects(
      store.install(preview.token, true),
      /Fixture shutdown failed.*No pack changes/,
    );
    assert.equal(f.control.getStatus().status, "active");
    assert.equal(
      createPluginStore(f.root)
        .findDevelompentPlugins()
        .find((plugin) => plugin.uuid === BP)?.versions.length,
      1,
    );
  } finally {
    f.cleanup();
  }
  const g = fixture(true);
  try {
    g.control.start = async () => {
      throw new Error("Fixture startup failed");
    };
    const store = createPluginUpdateStore(g.root, g.control);
    const preview = await store.importArchive(archive());
    await assert.rejects(
      store.install(preview.token, true),
      /Recovery failed.*Backup:/,
    );
    assert.equal(g.control.getStatus().status, "stopped");
    assert.equal(
      createPluginStore(g.root)
        .findDevelompentPlugins()
        .find((plugin) => plugin.uuid === BP)?.versions.length,
      1,
    );
  } finally {
    g.cleanup();
  }
});

test("previews refuse stale inventory, links, expired tokens, and too many stages", async () => {
  const f = fixture();
  try {
    const store = createPluginUpdateStore(f.root, f.control);
    const preview = await store.importArchive(archive());
    writeFileSync(
      join(f.root, "development_behavior_packs/old-bp/manifest.json"),
      JSON.stringify(manifest(BP, "data", [1, 0, 1])),
    );
    await assert.rejects(
      store.install(preview.token, true),
      /changed.*new preview/,
    );
    store.cancel(preview.token);
    const stages = [];
    for (let i = 0; i < 5; i++)
      stages.push(await store.importArchive(archive()));
    await assert.rejects(store.importArchive(archive()), /Five previews/);
    for (const stage of stages) store.cancel(stage.token);
    const expired = await store.importArchive(archive());
    expired.expiresAt = new Date(0).toISOString();
    await assert.rejects(store.install(expired.token, true), /expired/);
    symlinkSync("/tmp", join(f.root, "development_behavior_packs/old-bp/link"));
    await assert.rejects(
      store.importArchive(archive([1, 0, 1])),
      /link or special file/,
    );
  } finally {
    f.cleanup();
  }
});

test("API supports both prefixes, raw import, confirmation, errors, and shared mutation serialization", async () => {
  const f = fixture(true);
  const store = createPluginUpdateStore(f.root, f.control);
  const server = createApp({
    pluginUpdates: store,
    plugins: createPluginStore(f.root),
    control: f.control,
  }).listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (const prefix of ["", "/api"]) {
      const response = await fetch(`${base}${prefix}/plugins/updates`);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.ok(record(body));
      assert.deepEqual(body.sources, []);
    }
    const invalid = await fetch(`${base}/api/plugins/updates/import`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from("not a zip"),
    });
    assert.equal(invalid.status, 400);
    const imported = await fetch(`${base}/api/plugins/updates/import`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: archive(),
    });
    assert.equal(imported.status, 200);
    const preview = await imported.json();
    assert.ok(record(preview) && typeof preview.token === "string");
    const path = `${base}/api/plugins/updates/stages/${preview.token}/install`;
    assert.equal(
      (
        await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      400,
    );
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stop = f.control.stop;
    f.control.stop = async () => {
      entered();
      await blocked;
      await stop();
    };
    const installing = fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"confirmed":true}',
    });
    await waiting;
    const concurrent = await fetch(`${base}/api/plugins/updates/check`, {
      method: "POST",
    });
    assert.equal(concurrent.status, 409);
    const toggle = await fetch(`${base}/api/plugins/${BP}/1.0.0/toggle`, {
      method: "POST",
    });
    assert.equal(toggle.status, 409);
    release();
    assert.equal((await installing).status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    f.cleanup();
  }
});

test("plugin updater renders accessible initial controls without HTML injection", async () => {
  const f = fixture();
  try {
    const harness = join(f.root, "updater.mjs");
    await build({
      stdin: {
        contents: `
          import { createElement } from "react";
          import { renderToStaticMarkup } from "react-dom/server";
          import { PluginUpdater } from "./App/client/PluginList/PluginUpdater.tsx";
          export function render() {
            return renderToStaticMarkup(createElement(PluginUpdater, {
              plugins: [], busy: false, onRun() {}, onConfirm() {}
            }));
          }`,
        resolveDir: resolve(import.meta.dirname, ".."),
      },
      outfile: harness,
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      banner: {
        js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
      },
    });
    const { render } = await import(pathToFileURL(harness).href);
    const html = render();
    assert.match(html, /Check for updates/);
    assert.match(html, /Link source/);
    assert.match(html, /Inspect archive/);
    assert.match(html, /Loading update sources/);
  } finally {
    f.cleanup();
  }
});
