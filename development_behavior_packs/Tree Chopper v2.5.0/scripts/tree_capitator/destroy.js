import { world, system, ItemStack } from "./export";

const DIRECTIONS = [
   { dx: 1, dy: 0, dz: 0 },
   { dx: -1, dy: 0, dz: 0 },
   { dx: 0, dy: 1, dz: 0 },
   { dx: 0, dy: -1, dz: 0 },
   { dx: 0, dy: 0, dz: 1 },
   { dx: 0, dy: 0, dz: -1 },
   { dx: 0, dy: 2, dz: 0 },
   { dx: 1, dy: 1, dz: 0 },
   { dx: -1, dy: 1, dz: 0 },
   { dx: 0, dy: 1, dz: 1 },
   { dx: 0, dy: 1, dz: -1 },
   { dx: 1, dy: 0, dz: 1 },
   { dx: -1, dy: 0, dz: -1 },
   { dx: 1, dy: 0, dz: -1 },
   { dx: -1, dy: 0, dz: 1 },
   { dx: 1, dy: 1, dz: 1 },
   { dx: 1, dy: 1, dz: -1 },
   { dx: -1, dy: 1, dz: -1 },
   { dx: -1, dy: 1, dz: 1 },
];

world.afterEvents.playerBreakBlock.subscribe(({ brokenBlockPermutation, block, player, dimension }) => {
   if (!brokenBlockPermutation.hasTag("custom:log")) return;
   system.run(() => {
      const { x, y, z } = block.location;
      const originalType = brokenBlockPermutation.type.id;
      const altType = originalType.replace("rtc", "minecraft");
      const visited = new Set();

      player.playSound("dig.wood", { location: block.location, pitch: 1.3 });
      dimension.spawnItem(new ItemStack(brokenBlockPermutation.type.id), { x, y, z });

      function* removeAdjacentLogs(cx, cy, cz, count) {
         for (const { dx, dy, dz } of DIRECTIONS) {
            const nx = cx + dx;
            const ny = cy + dy;
            const nz = cz + dz;
            const key = `${nx},${ny},${nz}`;
            if (visited.has(key)) continue;
            visited.add(key);

            const adjacent = dimension.getBlock({ x: nx, y: ny, z: nz });
            if (!adjacent) continue;

            const type = adjacent.typeId;
            if (type !== originalType && type !== altType && !(type.includes("stripped") && type.includes("log") && type.includes("minecraft:"))) {
               continue;
            }

            yield;
            destroyBlock(dimension, nx, ny, nz);

            const { x: radiusX, z: radiusZ } = yield* calculateDynamicRadius(dimension, nx, ny, nz);

            if (!originalType.includes("stem")) {
               for (let ox = -radiusX; ox <= radiusX; ox++) {
                  for (let oz = -radiusZ; oz <= radiusZ; oz++) {
                     for (let oy = -2; oy <= 2; oy++) {
                        const lx = nx + ox;
                        const ly = ny + oy;
                        const lz = nz + oz;

                        system.runTimeout(() => {
                           const leaf = dimension.getBlock({ x: lx, y: ly, z: lz });
                           if (leaf?.typeId.includes("leaves")) {
                              destroyBlock(dimension, lx, ly, lz);
                           }
                        }, Math.abs(ox) + Math.abs(oz) + 20);
                     }
                  }
                  yield;
               }
            }

            if (++count >= 3) {
               system.runTimeout(() => system.runJob(removeAdjacentLogs(nx, ny, nz, 0)), 20);
               return;
            } else {
               yield* removeAdjacentLogs(nx, ny, nz, count);
            }
         }
      }

      system.runJob(removeAdjacentLogs(x, y, z, 0));
   });
});

function destroyBlock(dimension, x, y, z) {
   dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
}

function* calculateDynamicRadius(dimension, x, y, z) {
   let rx = 2,
      rz = 2;

   for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
         if (dx === 0 && dz === 0) continue;
         const distX = Math.abs(dx),
            distZ = Math.abs(dz);

         for (let dy = -3; dy <= 3; dy++) {
            const block = dimension.getBlock({ x: x + dx, y: y + dy, z: z + dz });
            if (block?.typeId.includes("log")) {
               if (distX <= 2 || distZ <= 2) return { x: 0, z: 0 };
               rx = Math.max(1, rx - 1);
               rz = Math.max(1, rz - 1);
            }
            yield;
         }
      }
      yield;
   }

   return { x: rx, z: rz };
}
