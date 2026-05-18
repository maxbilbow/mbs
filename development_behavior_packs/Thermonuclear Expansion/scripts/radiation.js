import { system, world } from "@minecraft/server";

system.runInterval(() => {
    const players = world.getAllPlayers();
    for (const player of players) {
        system.runInterval(() => {
            const location = world.getDynamicProperty("radioactive");
            const dimension = player.dimension;
            const locationPlayer = player.location;
            const distanceX = location.x - locationPlayer.x;
            const distanceY = location.y - locationPlayer.y;
            const distanceZ = location.z - locationPlayer.z;
            const distance = Math.sqrt(Math.pow(distanceX, 2) + Math.pow(distanceY, 2) + Math.pow(distanceZ, 2));
            if (distance < 150) {
                player.runCommand("fog @s push kaboom:nuclear_wasteland nuclear_wasteland");
                if (!player.hasTag("immune")) {
                    player.addEffect("wither", 40);
                };
            }
            else {
                player.runCommand("fog @s pop nuclear_wasteland");
            };
        }, 1);
    };
}, 4);