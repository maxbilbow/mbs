import {
  system,
  world,
  CommandPermissionLevel,
  CustomCommandStatus,
} from "@minecraft/server";

system.beforeEvents.startup.subscribe((init) => {
  const helloCommand = {
    name: "max:hello",          // MUST be namespaced: namespace:name
    description: "Confirms the plugin has loaded",
    permissionLevel: CommandPermissionLevel.Any,
  };

  init.customCommandRegistry.registerCommand(helloCommand, (origin) => {
    // Runs on the next tick — defer any world interaction
    system.run(() => {
      world.sendMessage("§aMax's Stuff is loaded and working!");
    });

    return {
      status: CustomCommandStatus.Success,
      message: "Hello from Max's Stuff!",
    };
  });
});

world.afterEvents.worldLoad.subscribe(() => {
  world.sendMessage("§eMax's Stuff script started");
});