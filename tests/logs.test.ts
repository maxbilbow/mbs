import assert from "node:assert/strict";
import { once } from "node:events";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../App/server/app.ts";
import { createLogReader, LOG_TAIL_BYTES } from "../App/server/data/Logs.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mbs-logs-test-"));
  const file = join(root, "bedrock.log");
  return {
    root,
    file,
    read: createLogReader(file),
    cleanup: () => rmSync(root, { recursive: true }),
  };
}

test("log snapshots report missing and empty files, appended output, truncation, and rotation", async () => {
  const f = fixture();
  try {
    assert.deepEqual(await f.read(), {
      text: "",
      available: false,
      truncated: false,
    });
    writeFileSync(f.file, "");
    assert.deepEqual(await f.read(), {
      text: "",
      available: true,
      truncated: false,
    });
    appendFileSync(f.file, "[INFO] Server started\n");
    assert.equal((await f.read()).text, "[INFO] Server started\n");
    appendFileSync(f.file, "[ERROR] Example\n");
    assert.equal(
      (await f.read()).text,
      "[INFO] Server started\n[ERROR] Example\n",
    );
    writeFileSync(f.file, "reset\n");
    assert.equal((await f.read()).text, "reset\n");
    renameSync(f.file, join(f.root, "old.log"));
    writeFileSync(f.file, "replacement\n");
    assert.equal((await f.read()).text, "replacement\n");
  } finally {
    f.cleanup();
  }
});

test("log snapshots read exactly the bounded tail and preserve UTF-8 boundaries", async () => {
  const f = fixture();
  try {
    const content = "x".repeat(LOG_TAIL_BYTES * 3) + "\nlatest\n";
    writeFileSync(f.file, content);
    const result = await f.read();
    assert.equal(result.truncated, true);
    assert.equal(Buffer.byteLength(result.text), LOG_TAIL_BYTES);
    assert.equal(result.text, content.slice(-LOG_TAIL_BYTES));
    writeFileSync(f.file, "x".repeat(LOG_TAIL_BYTES));
    assert.equal((await f.read()).truncated, false);
    const suffix = "z".repeat(LOG_TAIL_BYTES - 1);
    writeFileSync(f.file, `prefix\u{1f333}${suffix}`);
    assert.equal((await f.read()).text, suffix);
    writeFileSync(
      f.file,
      Buffer.concat([
        Buffer.from("Player: Zo\u00eb\n"),
        Buffer.from([0xf0, 0x9f]),
      ]),
    );
    assert.equal((await f.read()).text, "Player: Zo\u00eb\n");
    appendFileSync(f.file, Buffer.from([0x8c, 0xb3]));
    assert.equal((await f.read()).text, "Player: Zo\u00eb\n\u{1f333}");
  } finally {
    f.cleanup();
  }
});

test("non-regular files and symlinks are rejected rather than displayed", async () => {
  const f = fixture();
  try {
    mkdirSync(f.file);
    await assert.rejects(f.read, /regular file/);
    rmSync(f.file, { recursive: true });
    const target = join(f.root, "private.txt");
    writeFileSync(target, "not a server log");
    symlinkSync(target, f.file);
    await assert.rejects(f.read, { code: "ELOOP" });
  } finally {
    f.cleanup();
  }
});

test("log API supports both prefixes, disables caching, and surfaces read failures", async () => {
  const f = fixture();
  const app = createApp({ logs: f.read });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    for (const prefix of ["/api", ""]) {
      const missing = await fetch(base + prefix + "/mbs/logs");
      assert.equal(missing.status, 200);
      assert.deepEqual(await missing.json(), {
        text: "",
        available: false,
        truncated: false,
      });
      writeFileSync(f.file, "[INFO] <script>literal text</script>\n");
      const response = await fetch(base + prefix + "/mbs/logs");
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), {
        text: "[INFO] <script>literal text</script>\n",
        available: true,
        truncated: false,
      });
      rmSync(f.file);
    }
    mkdirSync(f.file);
    const failure = await fetch(base + "/api/mbs/logs");
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { error: "Internal server error" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    f.cleanup();
  }
});
