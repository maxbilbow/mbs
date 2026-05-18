import { system, world } from '@minecraft/server';
// import ChatCommand from './ChatCommants.js'
// import { commands } from './ChatCommants.js';

// way 1 to make commands
// ChatCommand.create('Road', 'Create a road', ['road'], false, false, (player, args, commandString) => {
//     player.sendMessage(`${player.name}, ${commandString}`)
//     system.run(() => player.runCommand(`fill ~ ~ ~ ~100 ~10 ~4 air"`))
//     system.run(() => player.runCommand(`fill ~ ~ ~ ~100 ~-1 ~4 smooth_quartz"`))
// });

system.runInterval(() => {
    world.sendMessage('MAX: script is running');
    console.log('Script is running');
    const players = world.getAllPlayers()

    for (const player of players) {
        player.sendMessage('MAX: Hello, ' + player.name);
    }
}, 10_000);

world.beforeEvents.chatSend.subscribe((data) => {
    console.log('Chat message received:', data);
    const { message, sender: player } = data;
    player.sendMessage(`"${message}" received`);
    if (!message.startsWith('.')) {
        return;
    }
    if (!['.road', '.Road'].includes(message)) {
        return;
    }
    system.run(() => {
        player.runCommand(`fill ~ ~ ~ ~100 ~10 ~4 air"`);
        player.runCommand(`fill ~ ~ ~ ~100 ~-1 ~4 smooth_quartz"`)
    });
    player.sendMessage(`§cCommand: "${message}" received`);
});


// //  way 2 make commands
// ChatCommand.create('command name', 'desc', ['cmd', 'comand'], false, (player => player.hasTag('cmd')), ((player, _, commandString) => {
//     player.sendMessage(`${player.name}, ${commandString}`)
//     system.run(() => player.runCommand(`gamemode s "${player.name}"`))
// }))

// // way 3 to make commands
// ChatCommand.create('find', 'find player', ['d ssd ds'], { 'target': 'string', 'amount': 'number' }, false, (player, args) => {
//     console.warn(args[`target`], args[`amount`])
//     const findplayer = world.getPlayers({ name: `${args['target']?.split('"')[1]}` })[0]
//     if (!findplayer) return player.sendMessage(`${args[`target`]} not found`)
//     console.warn(findplayer.name)
// });