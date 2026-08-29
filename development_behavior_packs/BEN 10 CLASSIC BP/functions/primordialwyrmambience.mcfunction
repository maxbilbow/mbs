execute at @s[tag=chargebeam] run particle primordialbeamcharge
execute at @s[tag=charged] run function primordialbeam
execute at @e[r=40,family=primordial_beam] run particle primordialbeam
execute as @e[r=40,type=projectile:primordial_dash_thing] run execute at @s run function primordialdashthingattacks
execute as @s[tag=rainattack] run execute at @r[r=100] run summon mechanic:rain_attack_1
execute as @s[tag=explosivefaces] run execute at @r[r=100] run summon mechanic:explosive_faces
execute as @s[tag=rainattack] run execute at @r[r=100] run summon mechanic:rain_attack_2
execute at @s[tag=bossmode] run particle primordialbubbles