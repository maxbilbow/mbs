event entity @e[r=2,type=power:arc_ice2] despawn
fill ~3 ~3 ~3 ~-3 ~-3 ~-3 ice replace water
fill ~2 ~2 ~2 ~-2 ~-2 ~-2 air replace fire
execute at @e[type=power:arc_ice] as @e[r=2,type=!power:arc_ice,type=!power:arc_ice2,family=!arctiguana,family=!npc,type=!item] at @s run summon power:arc_ice2
kill @e[type=power:arc_ice,r=1]