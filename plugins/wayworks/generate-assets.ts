import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// Original procedural pixel art, dedicated to the public domain under CC0-1.0.
const root = dirname(fileURLToPath(import.meta.url));

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(
  path: string,
  size: number,
  pixel: (x: number, y: number) => number[],
) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rows.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const destination = join(root, "resource/textures", path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const yellow = [232, 181, 45, 255];
const dark = [37, 49, 62, 255];
const white = [238, 241, 220, 255];
png("blocks/bus_stop.png", 16, (x, y) => {
  if (x === 0 || x === 15 || y === 0 || y === 15) return dark;
  if ((x === 4 || x === 11) && y >= 5 && y <= 11) return white;
  if (x >= 4 && x <= 11 && (y === 4 || y === 8)) return white;
  if ((x === 5 || x === 10) && y === 12) return dark;
  return yellow;
});
png("items/planner.png", 16, (x, y) => {
  if (x < 2 || x > 13 || y < 1 || y > 14) return [0, 0, 0, 0];
  if (x === 2 || x === 13 || y === 1 || y === 14) return yellow;
  if (x >= 5 && x <= 10 && (y === 5 || y === 8 || y === 11)) return dark;
  return white;
});
png("entity/worker.png", 64, (_x, y) =>
  y % 16 >= 10 && y % 16 <= 12 ? white : y % 16 >= 13 ? dark : yellow,
);
