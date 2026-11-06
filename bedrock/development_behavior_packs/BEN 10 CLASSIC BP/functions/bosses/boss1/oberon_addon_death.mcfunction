gamerule commandblockoutput false
tickingarea add ~2 0 ~2 ~-2 0 ~-2 counter
scoreboard objectives add death_trigger dummy
scoreboard objectives add died dummy
scoreboard objectives add life.counter dummy "life Count"
scoreboard players set @a death_trigger 1
scoreboard players set @e[type=player] death_trigger 0
execute as @a[scores={death_trigger=1,died=0},tag=instakill] run tag @s remove instakill
execute as @a[scores={death_trigger=1,died=0},tag=jump_slam_target] run tag @s remove jump_slam_target
execute as @a[scores={death_trigger=1,died=0}] run scoreboard players add @e[type=cso:oberon] oberon_regen 600
execute as @e[type=cso:oberon,scores={oberon_regen=1..}] run effect @s regeneration 2 2 true
execute as @e[type=cso:oberon,scores={oberon_regen=1..}] run particle minecraft:villager_happy ~ ~3.5 ~
scoreboard players remove @e[type=cso:oberon,scores={oberon_regen=1..}] oberon_regen 1
scoreboard players add @a[scores={death_trigger=1,died=0}] life.counter 1
scoreboard players set @a[scores={death_trigger=1,died=0}] died 1
scoreboard players set @e[type=player,scores={death_trigger=0}] died 0
kill @e[type=slime]