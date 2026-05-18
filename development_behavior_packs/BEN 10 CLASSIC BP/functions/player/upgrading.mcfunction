execute as @e[type=iron_golem,r=2] at @s as @p[family=!irongolem,r=2] at @s run function 1
execute as @e[type=boat,r=2] at @s as @p[family=!boat,r=2] at @s run function 2
execute as @e[type=minecart,r=2] at @s as @p[family=!minecart,r=2] at @s run function 4
execute as @s[family=upgrade] at @s if block ~ ~-1 ~ furnace run function 3
execute as @s[family=upgrade] at @s if block ~ ~-1 ~ noteblock run function 5
execute as @s[family=upgrade] at @s if block ~ ~-1 ~ piston run function 6
execute as @s[family=upgrade] at @s if block ~ ~-1 ~ sticky_piston run function 6