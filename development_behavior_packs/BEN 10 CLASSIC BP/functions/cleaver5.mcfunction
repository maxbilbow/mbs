scoreboard objectives add Cleavers dummy
scoreboard players add @s Cleavers 1
execute at @s[scores={Cleavers=5}] run summon mechanic:cleaver_5
execute at @s[scores={Cleavers=5}] run scoreboard players remove @s Cleavers 5