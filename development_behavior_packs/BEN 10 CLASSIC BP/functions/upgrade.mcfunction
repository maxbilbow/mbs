execute @e[type=iron_golem,r=2] ~~~ execute @a[r=2] ~~~ tag @s add golem
execute @a[tag=golem] ~~~ function upgolem
execute @s ~ ~ ~ detect ~~-1~ piston 0 function uppiston
execute @s ~ ~ ~ detect ~~-1~ piston 1 function uppiston
execute @s ~ ~ ~ detect ~~-1~ piston 2 function uppiston
execute @s ~ ~ ~ detect ~~-1~ piston 3 function uppiston
execute @s ~ ~ ~ detect ~~-1~ piston 4 function uppiston
execute @s ~ ~ ~ detect ~~-1~ piston 5 function uppiston
execute @s ~ ~ ~ detect ~ ~-1 ~ furnace 0 function furnace
execute @s ~ ~ ~ detect ~ ~-1 ~ furnace 1 function furnace
execute @s ~ ~ ~ detect ~ ~-1 ~ furnace 2 function furnace
execute @s ~ ~ ~ detect ~ ~-1 ~ furnace 3 function furnace
execute @s ~ ~ ~ detect ~ ~-1 ~ furnace 4 function furnace
execute @s ~ ~ ~ detect ~ ~-1 ~ furnace 5 function furnace
execute @s ~ ~ ~ detect ~~-1~ jukebox 0 tag @s add juke
execute @a[tag=juke] ~~~ function upjuke
execute @s ~ ~ ~ detect ~~-1~ dispenser 0 function updispenser
execute @s ~ ~ ~ detect ~~-1~ dispenser 1 function updispenser
execute @s ~ ~ ~ detect ~~-1~ dispenser 2 function updispenser
execute @s ~ ~ ~ detect ~~-1~ dispenser 3 function updispenser
execute @s ~ ~ ~ detect ~~-1~ dispenser 4 function updispenser
execute @s ~ ~ ~ detect ~~-1~ dispenser 5 function updispenser
execute @e[type=minecart,r=2] ~~~ execute @a[r=2] ~~~ tag @s add car
execute @a[tag=car] ~~~ function car
execute @e[type=boat,r=2] ~~~ execute @a[r=2] ~~~ tag @s add boat
execute @a[tag=boat] ~~~ function upboat