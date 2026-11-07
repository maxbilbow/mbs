import { system, world } from "@minecraft/server";

world.afterEvents.worldLoad.subscribe(() => {
  world.sendMessage(
    "[TypeScript example] Loaded. Run /scriptevent example:ping",
  );
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id === "example:ping") {
    world.sendMessage("[TypeScript example] Pong! TypeScript is running.");
  }
});
