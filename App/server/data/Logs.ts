import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { REPO_ROOT } from "../../../scripts/paths.ts";
import type { LogSnapshot } from "../../model/Logs.ts";

export const LOG_TAIL_BYTES = 64 * 1024;

export function createLogReader(file = join(REPO_ROOT, "logs/bedrock.log")) {
  return async (): Promise<LogSnapshot> => {
    let handle;
    try {
      handle = await open(
        file,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { text: "", available: false, truncated: false };
      }
      throw error;
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile())
        throw new Error("Bedrock log must be a regular file.");
      const start = Math.max(0, stat.size - LOG_TAIL_BYTES);
      const buffer = Buffer.alloc(Math.min(stat.size, LOG_TAIL_BYTES));
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          length,
          buffer.length - length,
          start + length,
        );
        if (!bytesRead) break;
        length += bytesRead;
      }
      let offset = 0;
      // A bounded tail may begin inside a UTF-8 character.
      while (offset < length && (buffer[offset] & 0xc0) === 0x80) offset++;
      return {
        text: new StringDecoder("utf8").write(buffer.subarray(offset, length)),
        available: true,
        truncated: start > 0,
      };
    } finally {
      await handle.close();
    }
  };
}
