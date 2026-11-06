event entity @e[type=power:eyeice2,r=2] despawn
execute as @e[type=power:eyeice] at @s as @e[r=2,type=!power:eyeice,type=!power:eyeice2,family=!eyeguy,family=!npc,type=!item] at @s run summon power:eyeice2
kill @e[type=power:eyeice,r=1]