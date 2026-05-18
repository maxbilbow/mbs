camerashake add @a[r=15] 0.6 1 positional
playsound random.explode @a[r=15] ~ ~ ~ 1 0.8
particle minecraft:huge_explosion_emitter ^ ^0.1 ^2
damage @e[r=6,rm=0.1,family=!player] 15 entity_attack
effect @e[r=6,rm=0.1,family=!player] slowness 2 255 true
effect @e[r=6,rm=0.1,family=!player] levitation 1 4 true
titleraw @s actionbar {"rawtext":[{"text":"§c§l> COMBO: GROUND SMASH <"}]}