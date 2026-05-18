scoreboard objectives add tree_cycle dummy "§aTree Cycle"
scoreboard players add timer tree_cycle 1
execute if score timer tree_cycle matches 2 run function start_growing/acacia_start
execute if score timer tree_cycle matches 4 run function start_growing/birch_start
execute if score timer tree_cycle matches 6 run function start_growing/oak_start
execute if score timer tree_cycle matches 8 run function start_growing/spruce_start
execute if score timer tree_cycle matches 10 run function start_growing/jungle_start
execute if score timer tree_cycle matches 12 run function start_growing/dark_oak_start
execute if score timer tree_cycle matches 14 run function start_growing/mangrove_start
execute if score timer tree_cycle matches 16 run function start_growing/cherry_start
execute if score timer tree_cycle matches 18 run function start_growing/big_jungle_start
execute if score timer tree_cycle matches 20 run function start_growing/big_spruce_start
execute if score timer tree_cycle matches 22 run function start_growing/pale_oak_start
execute if score timer tree_cycle matches 22.. run scoreboard players set timer tree_cycle 0