import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

// Original procedural pixel art, dedicated to the public domain (CC0-1.0).
const root = join(import.meta.dirname, "resource/textures");

function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function png(path: string, pixel: (x: number, y: number) => number[]) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(16, 0);
  header.writeUInt32BE(16, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(16 * 65);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) rows.set(pixel(x, y), y * 65 + 1 + x * 4);
  const destination = join(root, path);
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

const clear = [0, 0, 0, 0];
const mint = [182, 255, 232, 255];
const dark = [44, 99, 108, 255];
const handle = [95, 119, 131, 255];
const shapes: Record<string, (x: number, y: number) => boolean> = {
  visor: (x, y) =>
    x >= 2 &&
    x <= 13 &&
    y >= 4 &&
    y <= 9 &&
    !(x >= 4 && x <= 11 && y >= 6 && y <= 7),
  chestplate: (x, y) =>
    y >= 2 &&
    y <= 13 &&
    x >= 2 &&
    x <= 13 &&
    !(y < 5 && x >= 6 && x <= 9) &&
    !(y >= 7 && (x < 4 || x > 11)),
  leggings: (x, y) =>
    x >= 4 && x <= 11 && y >= 2 && y <= 14 && !(y >= 6 && (x === 7 || x === 8)),
  boots: (x, y) =>
    y >= 6 && y <= 13 && ((x >= 2 && x <= 6) || (x >= 9 && x <= 13)),
  sword: (x, y) =>
    (Math.abs(x + y - 15) <= 1 && x >= 3 && x <= 13) ||
    (y === 10 && x >= 3 && x <= 8),
  pickaxe: (x, y) =>
    (Math.abs(x + y - 16) <= 1 && x >= 3 && x <= 11) ||
    (y >= 2 && y <= 4 && x >= 4 && x <= 13) ||
    (x >= 11 && x <= 13 && y >= 4 && y <= 7),
  axe: (x, y) =>
    (Math.abs(x + y - 16) <= 1 && x >= 3 && x <= 12) ||
    (x >= 7 && x <= 12 && y >= 2 && y <= 6),
  shovel: (x, y) =>
    (Math.abs(x + y - 16) <= 1 && x >= 3 && x <= 11) ||
    (x >= 9 && x <= 13 && y >= 2 && y <= 6),
};
for (const [name, shape] of Object.entries(shapes))
  png(`items/spectral_${name}.png`, (x, y) =>
    shape(x, y)
      ? y >= 10 && ["sword", "axe", "pickaxe", "shovel"].includes(name)
        ? handle
        : (x + y) % 4 === 0
          ? dark
          : mint
      : clear,
  );

png("blocks/ectoplasm.png", (x, y) =>
  (x * 7 + y * 3) % 11 < 3 ? [140, 226, 205, 255] : mint,
);
png("blocks/ghost_block.png", (x, y) =>
  x === 0 || y === 0 || x === 15 || y === 15
    ? [182, 255, 232, 180]
    : [82, 171, 166, (x + y) % 5 === 0 ? 80 : 25],
);
png("entity/invisible.png", () => clear);
png("particle/specter.png", (x, y) => {
  if (y < 2 || x < 3 || x > 12 || (y < 5 && (x < 5 || x > 10))) return clear;
  if (y >= 13 && (x + y) % 4 < 2) return clear;
  if (y >= 5 && y <= 7 && (x === 6 || x === 9)) return dark;
  return [182, 255, 232, 150];
});
