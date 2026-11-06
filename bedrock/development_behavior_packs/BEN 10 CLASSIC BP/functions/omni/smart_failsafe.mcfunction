tag @s add failsafe_check
effect @s instant_health 2 10 true
effect @s regeneration 3 255 true
execute as @s at @s if block ~ ~ ~ water run tag @s add hazard_water
execute as @s at @s if block ~ ~1 ~ water run tag @s add hazard_water
execute as @s at @s if block ~ ~ ~ flowing_water run tag @s add hazard_water
execute as @s at @s if block ~ ~1 ~ flowing_water run tag @s add hazard_water
execute as @s at @s if block ~ ~ ~ powder_snow run tag @s add hazard_snow
execute as @s at @s if block ~ ~1 ~ powder_snow run tag @s add hazard_snow
execute as @s at @s if block ~ ~ ~ lava run tag @s add hazard_fire
execute as @s at @s if block ~ ~1 ~ lava run tag @s add hazard_fire
execute as @s at @s if block ~ ~-1 ~ lava run tag @s add hazard_fire
execute as @s at @s if block ~ ~ ~ flowing_lava run tag @s add hazard_fire
execute as @s at @s if block ~ ~1 ~ flowing_lava run tag @s add hazard_fire
execute as @s at @s if block ~ ~-1 ~ flowing_lava run tag @s add hazard_fire
execute as @s at @s if block ~ ~ ~ fire run tag @s add hazard_fire
execute as @s at @s if block ~ ~1 ~ fire run tag @s add hazard_fire
execute as @s at @s if block ~ ~-1 ~ fire run tag @s add hazard_fire
execute as @s at @s if block ~ ~ ~ magma run tag @s add hazard_fire
execute as @s at @s if block ~ ~-1 ~ magma run tag @s add hazard_fire
execute as @s at @s if block ~ ~-2 ~ magma run tag @s add hazard_fire
execute as @s at @s if entity @e[type=creeper,r=6] run tag @s add hazard_explode
execute as @s at @s if entity @e[type=skeleton,r=12] run tag @s add hazard_projectile
execute as @s at @s if entity @e[family=monster,r=4] run tag @s add hazard_monster
execute as @s[tag=failsafe_check,tag=hazard_water,scores={aliens=9..}] run event entity @s ripjaws
execute as @s[tag=failsafe_check,tag=hazard_water,scores={aliens=9..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_snow,scores={aliens=20..}] run event entity @s arctiguana
execute as @s[tag=failsafe_check,tag=hazard_snow,scores={aliens=20..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_fire,scores={aliens=2..}] run event entity @s heatblast
execute as @s[tag=failsafe_check,tag=hazard_fire,scores={aliens=2..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_explode,scores={aliens=17..}] run event entity @s upchuck
execute as @s[tag=failsafe_check,tag=hazard_explode,scores={aliens=17..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_explode,scores={aliens=12..}] run event entity @s cannonbolt
execute as @s[tag=failsafe_check,tag=hazard_explode,scores={aliens=12..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_explode,scores={aliens=4..}] run event entity @s diamondhead
execute as @s[tag=failsafe_check,tag=hazard_explode,scores={aliens=4..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_projectile,scores={aliens=19..}] run event entity @s eyeguy
execute as @s[tag=failsafe_check,tag=hazard_projectile,scores={aliens=19..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_projectile,scores={aliens=5..}] run event entity @s xlr8
execute as @s[tag=failsafe_check,tag=hazard_projectile,scores={aliens=5..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=22..}] run event entity @s waybig
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=22..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=18..}] run event entity @s ditto
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=18..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=16..}] run event entity @s benvictor
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=16..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=15..}] run event entity @s benmummy
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=15..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=14..}] run event entity @s benwolf
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=14..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=13..}] run event entity @s wildvine
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=13..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=7..}] run event entity @s fourarms
execute as @s[tag=failsafe_check,tag=hazard_monster,scores={aliens=7..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=22..}] run event entity @s waybig
execute as @s[tag=failsafe_check,scores={aliens=22..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=21..}] run event entity @s clockwork
execute as @s[tag=failsafe_check,scores={aliens=21..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=20..}] run event entity @s arctiguana
execute as @s[tag=failsafe_check,scores={aliens=20..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=19..}] run event entity @s eyeguy
execute as @s[tag=failsafe_check,scores={aliens=19..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=18..}] run event entity @s ditto
execute as @s[tag=failsafe_check,scores={aliens=18..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=17..}] run event entity @s upchuck
execute as @s[tag=failsafe_check,scores={aliens=17..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=16..}] run event entity @s benvictor
execute as @s[tag=failsafe_check,scores={aliens=16..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=15..}] run event entity @s benmummy
execute as @s[tag=failsafe_check,scores={aliens=15..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=14..}] run event entity @s benwolf
execute as @s[tag=failsafe_check,scores={aliens=14..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=13..}] run event entity @s wildvine
execute as @s[tag=failsafe_check,scores={aliens=13..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=12..}] run event entity @s cannonbolt
execute as @s[tag=failsafe_check,scores={aliens=12..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=11..}] run event entity @s upgrade
execute as @s[tag=failsafe_check,scores={aliens=11..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=10..}] run event entity @s ghostfreak
execute as @s[tag=failsafe_check,scores={aliens=10..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=9..}] run event entity @s ripjaws
execute as @s[tag=failsafe_check,scores={aliens=9..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=8..}] run event entity @s stinkfly
execute as @s[tag=failsafe_check,scores={aliens=8..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=7..}] run event entity @s fourarms
execute as @s[tag=failsafe_check,scores={aliens=7..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=6..}] run event entity @s greymatter
execute as @s[tag=failsafe_check,scores={aliens=6..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=5..}] run event entity @s xlr8
execute as @s[tag=failsafe_check,scores={aliens=5..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=4..}] run event entity @s diamondhead
execute as @s[tag=failsafe_check,scores={aliens=4..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=3..}] run event entity @s wildmutt
execute as @s[tag=failsafe_check,scores={aliens=3..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check,scores={aliens=2..}] run event entity @s heatblast
execute as @s[tag=failsafe_check,scores={aliens=2..}] run tag @s remove failsafe_check
execute as @s[tag=failsafe_check] run event entity @s diamondhead
tag @s remove failsafe_check
tag @s remove hazard_water
tag @s remove hazard_snow
tag @s remove hazard_fire
tag @s remove hazard_explode
tag @s remove hazard_projectile
tag @s remove hazard_monster
scoreboard objectives add omni_off dummy
scoreboard players add @s omni_off 0
scoreboard objectives add omni_charge dummy
tag @s remove omni_using
clear @s omni:omni_icon
clear @s omni:omni_master