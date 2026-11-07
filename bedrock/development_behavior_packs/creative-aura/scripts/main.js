// plugins/creative-aura/behavior/scripts/main.ts
import {
  GameMode,
  InvalidEntityError,
  LocationInUnloadedChunkError,
  LocationOutOfWorldBoundariesError,
  system,
  world
} from "@minecraft/server";
var intervalTicks = 10;
var particleCount = 6;
var radius = 0.65;
var phase = 0;
system.runInterval(() => {
  phase = (phase + Math.PI / 12) % (2 * Math.PI);
  for (const player of world.getAllPlayers()) {
    if (!player.isValid) continue;
    try {
      if (player.getGameMode() !== GameMode.Creative) continue;
      const { location, dimension } = player;
      for (let index = 0; index < particleCount; index++) {
        const angle = phase + index * 2 * Math.PI / particleCount;
        dimension.spawnParticle("minecraft:endrod", {
          x: location.x + radius * Math.cos(angle),
          y: location.y + 1,
          z: location.z + radius * Math.sin(angle)
        });
      }
    } catch (error) {
      if (!(error instanceof InvalidEntityError) && !(error instanceof LocationInUnloadedChunkError) && !(error instanceof LocationOutOfWorldBoundariesError)) {
        throw error;
      }
      console.warn(
        `[Creative Aura] Could not emit particles for player ${player.id}: ${error.message}`
      );
    }
  }
}, intervalTicks);
