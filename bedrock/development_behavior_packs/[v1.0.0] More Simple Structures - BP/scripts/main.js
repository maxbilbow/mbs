import {
    ActionFormData,
    ModalFormData,
    MessageFormData
} from "@minecraft/server-ui";
import { world, ItemStack } from "@minecraft/server";

const structureData = [
    ["Abandoned Castle", "A large, ruined castle that may still contain some valuable loot to find.\n\n§8§lSpawns in:\n\n§fForest\n§fPlains\n§fTaiga\n§fSwamp\n\n\n\n"],
    ["Abandoned Fort", "A small, fortified outpost left behind by unknown settlers.\n\n§8§lSpawns in:\n\n§fForest\n§fSwamp\n§fRoofed\n§fBirch\n§fTaiga\n\n\n\n"],
    ["Abandoned House", "A lonely, decaying house with signs of past life.\n\n§8§lSpawns in:\n\n§fForest\n§fPlains\n§fTaiga\n\n\n\n"],
    ["Additional Monster Dungeons", "Hidden underground rooms filled with monster spawners and loot.\n\n§8§lSpawns:\n\n§fUnderground\n\n\n\n"],
    ["Altar Ruins", "Ancient stone altars. What was their purpose?\n\n§8§lSpawns in:\n\n§fForest\n§fPlains\n§fTaiga\n§fBirch\n§fRoofed\n§fPale Garden\n§fSavanna\n§fMeadow\n\n\n\n"],
    ["Broken Conduit", "Remnants of a conduit, forgotten to the sea.\n\n§8§lSpawns in:\n\n§fOceans\n\n\n\n"],
    ["Camp", "A campsite with tents, a campfire, and there may still be some supplies left behind.\n\n§8§lSpawns in:\n\n§fForest\n§fPlains\n§fTaiga\n§fBirch\n§fRoofed\n§fMeadow\n§fSwamp\n§fMangrove Swamp\n§fPale Garden\n§fCherry Grove\n\n\n\n"],
    ["Cave Camp", "A small underground camp left behind by a previous adventurer.\n\n§8§lSpawns in:\n\n§fCaves\n\n\n\n"],
    ["Cemetery", "A spooky graveyard with tombstones and the occasional chest.\n\n§8§lSpawns in:\n\n§fForest\n§fPlains\n§fTaiga\n§fRoofed\n§fPale Garden\n§fSavanna\n\n\n\n"],
    ["Cobblestone Well", "A simple cobblestone well containing water.\n\n§8§lSpawns in:\n\n§fForest\n§fPlains\n§fTaiga\n§fRoofed\n§fPale Garden\n§fSavanna\n\n\n\n"],
    ["Crashed Endship", "A wrecked End ship with loot, crashed in The End.\n\n§8§lSpawns in:\n\n§fThe End\n\n\n\n"],
    ["Desert Pyramid", "A pyramid with hidden and valuable treasures. Undead mummies lurk within the corridors.\n\n§8§lSpawns in:\n\n§fDesert\n\n\n\n"],
    ["Desert Ruin", "Crumbling sandstone ruins, remnants of an ancient civilization.\n\n§8§lSpawns in:\n\n§fDesert\n\n\n\n"],
    ["Desert Totem", "A mysterious sandstone totem with unknown origins.\n\n§8§lSpawns in:\n\n§fDesert\n\n\n\n"],
    ["End City Rubble", "Scattered debris from End Cities, the cause is unknown.\n\n§8§lSpawns in:\n\n§fThe End\n\n\n\n"],
    ["Evoker Tower", "A tall, dark tower inhabited by evokers and other illagers.\n\n§8§lSpawns in:\n\n§fSwamp\n§fRoofed\n§fTaiga\n\n\n\n"],
    ["Fishing Hut", "A cozy hut by the water, with fishing gear and supplies.\n\n§8§lSpawns in:\n\n§fBeach\n\n\n\n"],
    ["Haunted House", "A creepy, abandoned house rumored to be haunted.\n\n§8§lSpawns in:\n\n§fRoofed\n§fPale Garden\n\n\n\n"],
    ["Illager Fort", "A heavily guarded illager outpost with valuable loot within.\n\n§8§lSpawns in:\n\n§fForest\n§fPlains\n§fSwamp\n§fMeadow\n§fGrove\n§fSavanna\n\n\n\n"],
    ["Jungle Brazier", "A once-burning brazier, marking a mysterious jungle site.\n\n§8§lSpawns in:\n\n§fJungle\n\n\n\n"],
    ["Jungle Fort Ruin", "Ruined jungle fortifications, overgrown with time.\n\n§8§lSpawns in:\n\n§fJungle\n\n\n\n"],
    ["Jungle Pedestal", "A mossy stone pedestal, used by an ancient civilization.\n\n§8§lSpawns in:\n\n§fJungle\n\n\n\n"],
    ["Jungle Pyramid", "A large, maze-like pyramid with traps and rare loot.\n\n§8§lSpawns in:\n\n§fJungle\n\n\n\n"],
    ["Jungle Statue", "A mysterious statue carved, found in different positions, deep in the jungle.\n\n§8§lSpawns in:\n\n§fJungle\n\n\n\n"],
    ["Mangrove Hut", "A wooden hut built on stilts in the mangrove swamp.\n\n§8§lSpawns in:\n\n§fMangrove Swamp\n\n\n\n"],
    ["Mushroom House", "A small whimsical house made from mushrooms.\n\n§8§lSpawns in:\n\n§fMushroom Island\n\n\n\n"],
    ["Piglin Boat", "A boat made from blackstone, used by piglins to transport their loot across the Nether.\n\n§8§lSpawns in:\n\n§fThe Nether\n\n\n\n"],
    ["Piglin Fortress", "A massive fortress ruled by piglins, full of danger and valuable treasures.\n\n§8§lSpawns in:\n\n§fThe Nether\n\n\n\n"],
    ["Piglin Outpost", "An outpost, similar to those of pillagers, containing piglins and treasure.\n\n§8§lSpawns in:\n\n§fThe Nether\n\n\n\n"],
    ["Pillager Cabin", "A wooden cabin used as a quick shelter by pillagers while patrolling.\n\n§8§lSpawns in:\n\n§fForest\n§fTaiga\n\n\n\n"],
    ["Pillager Camp", "A pillager encampment with tents and supplies used by pillagers while patrolling.\n\n§8§lSpawns in:\n\n§fPlains\n§fSavanna\n§fForest\n§fMeadow\n§fGrove\n§fTaiga\n\n\n\n"],
    ["Pirate Ship", "A large pirate ship floating in the ocean used by pillagers.\n\n§8§lSpawns in:\n\n§fOceans\n\n\n\n"],
    ["Pirate Shipwreck", "A sunken pirate ship once used by pillagers, broken from an unknown cause, forgotten at sea.\n\n§8§lSpawns in:\n\n§fOceans\n\n\n\n"],
    ["Sphinx", "A giant stone sphinx statue, overlooking the desert sands.\n\n§8§lSpawns in:\n\n§fDesert\n\n\n\n"],
    ["Spider Cavern", "A dark, web-filled cavern that is home to the Spider Queen.\n\n§8§lSpawns:\n\n§fUnderground\n\n\n\n"],
    ["Standing Rubble", "Remains of an old stone structure, now just overgrown rubble.\n\n§8§lSpawns in:\n\n§fForest\n§fRoofed\n§fPlains\n§fTaiga\n§fSavanna\n\n\n\n"],
    ["Surface Dungeon", "A dungeon on the surface, filled with mobs and loot.\n\n§8§lSpawns in:\n\n§fBirch\n§fForest\n§fRoofed\n§fTaiga\n\n\n\n"],
    ["Swamp Cabin", "An old, small wooden cabin hidden in the swamp.\n\n§8§lSpawns in:\n\n§fSwamp\n\n\n\n"],
    ["Trader Cart", "A wandering trader’s cart, providing shelter between villages.\n\n§8§lSpawns in:\n\n§fForest\n§fPlains\n§fTaiga\n§fSavanna\n§fDesert\n§fMeadow\n§fCherry Grove\n\n\n\n"],
    ["Trial Tower", "A tall, challenging tower with several levels to fight through and rewards at the top.\n\n§8§lSpawns in:\n\n§fAll Overworld biomes\n\n\n\n"],
    ["Watchtower", "An old lookout tower once used for spotting, but is now abandoned.\n\n§8§lSpawns in:\n\n§fForest\n§fTaiga\n\n\n\n"],
    ["Wolf Den", "A den dug into the terrain, home to a pack of wolves.\n\n§8§lSpawns in:\n\n§fForest\n§fRoofed\n§fJungle Edge\n§fTaiga\n§fSavanna\n§fGrove\n\n\n\n"]
];

function playPageTurnSound(player) {
    player.runCommandAsync("playsound item.book.page_turn @s");
}

function showIntroScreen(player) {
    const form = new ActionFormData()
        .title("§oMore Simple Structures Info Book§r")
        .body("§7[v1.0.1]§r\n\nWelcome to the §3§lMore Simple Structures§r Add-On!\n\nAs you explore your world, you'll now come across a variety of new structures. These range from small, mysterious altars to maze-like jungle pyramids.\n\nSome of these structures may hold valuable loot, while others remain empty. In some cases, you may also stumble upon a few new mobs, adding even more surprises to your adventures.\n\nSpawn rates vary, making some structures rarer than others, ensuring that each new encounter feels special. This also helps prevent structure overcrowding, allowing the add-on to remain unintrusive to your experience.\n\nContinue to the next page to view a list of structures and where they spawn.\n\n§oStay tuned for exciting future updates!§r\n\nHappy adventuring!\n\n")
        .button("Continue")
        .button("Close");

    form.show(player).then(response => {
        if (response.selection === 0) {
            playPageTurnSound(player);
            showMainMenu(player);
        }
    });
}

function showMainMenu(player) {
    const form = new ActionFormData()
        .title("Main Menu")
        .body("Choose an option:")
        .button("Structures", "textures/coreblockstudios/moresimplestructures/guide/structure_icon.png")
        .button("Mobs", "textures/ui/sidebar_icons/genre.png")
        .button("Credits", "textures/ui/icon_best3.png")
        .button("Feedback", "textures/ui/Feedback.png")
        .button("Dev Notes", "textures/ui/creative_icon.png")
        .button("Back");

    form.show(player).then(response => {
        if (response.canceled) return;
        playPageTurnSound(player);

        switch (response.selection) {
            case 0:
                showStructureList(player);
                break;
            case 1:
                showMobList(player);
                break;
            case 2:
                showCredits(player);
                break;
            case 3:
                showCommunityInfo(player);
                break;
            case 4:
                showDevNotes(player);
                break;
            case 5:
                showIntroScreen(player);
                break;
        }
    });
}

function showStructureList(player) {
    const form = new ActionFormData()
        .title("§lStructures§r")
        .body("Select a structure, or search for one:\n")
        .button("§lSearch§r")
        .button("------------------------");
    form
        .button("Abandoned Castle")
        .button("Abandoned Fort")
        .button("Abandoned House")
        .button("Additional Monster Dungeons")
        .button("Altar Ruins")
        .button("Broken Conduit")
        .button("Camp")
        .button("Cave Camp")
        .button("Cemetery")
        .button("Cobblestone Well")
        .button("Crashed Endship")
        .button("Desert Pyramid")
        .button("Desert Ruin")
        .button("Desert Totem")
        .button("End City Rubble")
        .button("Evoker Tower")
        .button("Fishing Hut")
        .button("Haunted House")
        .button("Illager Fort")
        .button("Jungle Brazier")
        .button("Jungle Fort Ruin")
        .button("Jungle Pedestal")
        .button("Jungle Pyramid")
        .button("Jungle Statue")
        .button("Mangrove Hut")
        .button("Mushroom House")
        .button("Piglin Boat")
        .button("Piglin Fortress")
        .button("Piglin Outpost")
        .button("Pillager Cabin")
        .button("Pillager Camp")
        .button("Pirate Ship")
        .button("Pirate Shipwreck")
        .button("Sphinx")
        .button("Spider Cavern")
        .button("Standing Rubble")
        .button("Surface Dungeon")
        .button("Swamp Cabin")
        .button("Trader Cart")
        .button("Trial Tower")
        .button("Watchtower")
        .button("Wolf Den")
        .button("§lBack§r");

    form.show(player).then(response => {
        if (response.canceled) return;
        playPageTurnSound(player);

        if (response.selection === 0) {
            showStructureSearch(player);
        } else if (response.selection === 1) {
            // Divider line — do nothing
            return;
        } else if (response.selection === 44) {
            showMainMenu(player);
        } else {
            const index = response.selection - 2;
            showStructureInfo(player, index);
        }
    });
}

function showStructureInfo(player, selectionOrName, maybeDescription) {
    let name, description;

    if (typeof selectionOrName === "number") {
        [name, description] = structureData[selectionOrName];
    } else {
        name = selectionOrName;
        description = maybeDescription;
    }

    const form = new MessageFormData()
        .title(name)
        .body(description)
        .button1("Back")
        .button2("Main Menu");

    form.show(player).then(response => {
        if (response.selection === 0) {
            playPageTurnSound(player);
            showStructureList(player);
        } else if (response.selection === 1) {
            playPageTurnSound(player);
            showMainMenu(player);
        }
    });
}

function showDevNotes(player) {
    const form = new MessageFormData()
        .title("§lDev Notes§r")
        .body("While it is the goal, structure placement may not always be perfect.\n\nIf you feel a specific structure's rates need to be adjusted, please join the Discord found in the Feedback tab to suggest!\n\nDue to the varied spawn rates, some structures will be challenging to find, while others will be fairly common. This is normal, and is the intended design to ensure diversity among the structures, while preventing the world from feeling too overpopulated with structures.\n\n\n")
        .button1("Back")
        .button2("Close");

    form.show(player).then(response => {
        if (response.selection === 0) {
            playPageTurnSound(player);
            showMainMenu(player);
        } else if (response.selection === 1) {
            playPageTurnSound(player);
            showMainMenu(player);
        }
    });
}

function showCredits(player) {
    const form = new MessageFormData()
        .title("§lCredits§r")
        .body(`More Simple Structures Add-On\n\nCreated by CoreBlock Studios\n\nPublished by Waypoint Studios\n\nThank you to my Discord community for providing feedback and suggestions over the years.\n\nLast but not least, thank you §e${player.name}§r for playing!\n\n`)
        .button1("Back")
        .button2("Close");

    form.show(player).then(response => {
        if (response.selection === 0) {
            playPageTurnSound(player);
            showMainMenu(player);
        }
    });
}

function showCommunityInfo(player) {
    const form = new MessageFormData()
        .title("§lFeedback§r")
        .body("Have a suggestion or a bug report? Your feedback is important!\n\nJoin our Discord to give suggestions, report bugs, and get the latest news regarding new future updates!\n\n§9Discord§r: discord.gg/UZZRwBf3xD\n§bX/Twitter§r: §7@coreblockstudio§r\n\n\n")
        .button1("Back")
        .button2("Close");

    form.show(player).then(response => {
        if (response.selection === 0) {
            playPageTurnSound(player);
            showMainMenu(player);
        }
    });
}

function showStructureSearch(player) {
    const form = new ModalFormData()
        .title("§lSearch Structures§r")
        .textField("Enter the structure name or keyword:", "Search here...");

    form.show(player).then(response => {
        if (response.canceled) {
            showStructureList(player); 
        } else {
            const searchText = response.formValues[0].toLowerCase();
            let searchResults = structureData.filter(([name, description]) => 
                name.toLowerCase().includes(searchText)
            );
            showSearchResults(player, searchResults);
        }
    });
}

function showSearchResults(player, results) {
    if (results.length === 0) {
        const form = new MessageFormData()
            .title("§lNo Results Found§r")
            .body("No structures match your search.\nTry again with different keywords.")
            .button1("Back");

        form.show(player).then(response => {
            if (response.selection === 0) {
                showStructureSearch(player);
            }
        });
    } else {
        const form = new ActionFormData()
            .title("§lSearch Results§r");
        results.forEach(([name, description]) => {
            form.button(name);
        });
        form.button("Back");

        form.show(player).then(response => {
            if (response.canceled) return;
            playPageTurnSound(player);
            if (response.selection === results.length) {
                showStructureSearch(player);
            } else {
                const selectedStructure = results[response.selection];
                const [name, description] = selectedStructure;
                showStructureInfo(player, name, description);
            }
        });
    }
}

const mobData = [
    {
        name: "Mummy",
        image: "textures/coreblockstudios/moresimplestructures/guide/mummy.png",
        description: "An ancient hostile undead monster, wrapped in dirty, sandy cloth that has the ability to hinder the player's sight. Mummies are slow-moving but relentless, and their attacks can make it difficult to see clearly when attacked. They are most commonly found wandering the corridors of Desert Pyramids, where they protect the treasures hidden within.\n\n§7Attack damage§r: 4\n§7Inflicts§r: Blindness\n§7Health§r: 20\n§7Spawns in§r:\nDesert Pyramids\n\n"
    },
    {
        name: "Spirit",
        image: "textures/coreblockstudios/moresimplestructures/guide/spirit.png",
        description: "A hostile undead monster, once an adventurer, that has the ability to slow their target. Spirits drift silently through Haunted Houses, seeking to drain the energy of any who enter. Their chilling presence makes movement sluggish when attacked.\n\n§7Attack damage§r: 4\n§7Inflicts§r: Slowness\n§7Health§r: 25\n§7Spawns in§r:\nHaunted House\n\n"
    },
    {
        name: "Spider Queen",
        image: "textures/coreblockstudios/moresimplestructures/guide/queenspider.png",
        description: "A large, dangerous arachnid that will shoot webs at its target, slowing them. When attacking its target, it has the ability to inflict fatal poison. The Spider Queen is much larger than ordinary spiders and is much stronger. She will call spiders and cave spiders for aid during battle.\n\n§7Attack damage§r: 12\n§7Inflicts§r: Fatal Poison\n§7Health§r: 150\n§7Special Abilities§r: Summons spiders for aid\n§7Spawns in§r:\nSpider Nest\n\n"
    }
];

function showMobList(player) {
    const form = new ActionFormData()
        .title("§lMob List§r")
        .body("Select a mob:\n");

    mobData.forEach(mob => {
        form.button(mob.name, mob.image);
    });

    form.button("Back");

    form.show(player).then(response => {
        if (response.canceled || response.selection === undefined) return;

        playPageTurnSound(player);
        if (typeof mobData !== "undefined" && response.selection < mobData.length) {
            const selectedMob = mobData[response.selection];
            showMobInfo(player, selectedMob);
        } else {
            showMainMenu(player);
        }
    });
}


function showMobInfo(player, mob) {
    const form = new MessageFormData()
        .title(mob.name)
        .body(`§7${mob.description}§r`)
        .button1("Back")
        .button2("Mob List");

    form.show(player).then(response => {
        if (response.selection === 0) {
            playPageTurnSound(player);
            showMobList(player);
        } else if (response.selection === 1) {
            playPageTurnSound(player);
            showMobList(player);
        }
    });
}










export { showIntroScreen };


world.afterEvents.itemUse.subscribe(event => {
    const player = event.source;
    const item = event.itemStack;

    if (player && item?.typeId === "wypnt_mss:info_book") {
        player.runCommandAsync("playsound item.book.page_turn @s");
        showIntroScreen(player);
        
    }
});

world.afterEvents.playerSpawn.subscribe((event) => {
    if (!event.initialSpawn) return;

    const VERSION = "1.0.1";

    const versionRegistered = event.player.getDynamicProperty("[wypnt_mss]_version");


    if (versionRegistered === VERSION) return;
    if (versionRegistered === undefined)
    event.player.setDynamicProperty("[wypnt_mss]_version", VERSION);
   if(versionRegistered) {

    event.player.sendMessage(`[§3More Simple Structures§r] updated from §7v${versionRegistered}§r to §7v${VERSION}§r!`)
   } else {
      event.player.dimension.spawnItem(
      new ItemStack("wypnt_mss:info_book"),
      event.player.location
    );
   }
  
  });
