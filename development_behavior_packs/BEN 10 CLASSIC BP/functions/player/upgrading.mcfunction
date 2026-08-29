execute as @s at @s if entity @e[type=iron_golem,r=2] run function 1
execute as @s at @s if entity @e[type=boat,r=2] run function 2
execute as @s at @s if entity @e[type=minecart,r=2] run function 4
execute as @s at @s if block ~ ~-1 ~ furnace run function 3
execute as @s at @s if block ~ ~-1 ~ noteblock run function 5
execute as @s at @s if block ~ ~-1 ~ piston run function 6