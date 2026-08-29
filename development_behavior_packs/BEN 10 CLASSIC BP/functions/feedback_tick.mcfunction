scoreboard objectives add strikedl dummy
scoreboard objectives add b_life dummy
scoreboard players add @e[type=zk:lightninghitbullet] b_life 1
scoreboard players add @e[type=zk:lightninghitbullett] b_life 1
kill @e[type=zk:lightninghitbullet,scores={b_life=60..}]
kill @e[type=zk:lightninghitbullett,scores={b_life=60..}]
execute as @e[type=zk:lightninghitbullet] at @s run particle zk:lightninghit ^ ^ ^1.5
execute as @e[type=zk:lightninghitbullett] at @s run particle zk:lightninghitt ^ ^ ^1.5
execute as @e[type=zk:lightninghitbullet] at @s facing entity @e[family=monster,type=!player,c=1,r=15,rm=1] eyes run tp @s ^ ^ ^1.5
execute as @e[type=zk:lightninghitbullett] at @s facing entity @e[family=monster,type=!player,c=1,r=15,rm=1] eyes run tp @s ^ ^ ^1.5
execute as @e[type=zk:lightninghitbullet] at @s run tag @e[family=monster,type=!player,r=4,c=1] add doomed_zap
execute as @e[type=zk:lightninghitbullett] at @s run tag @e[family=monster,type=!player,r=4,c=1] add doomed_zap
execute as @e[tag=doomed_zap] at @s run kill @e[type=zk:lightninghitbullet,r=5]
execute as @e[tag=doomed_zap] at @s run kill @e[type=zk:lightninghitbullett,r=5]
effect @e[tag=doomed_zap] slowness 1 255 true
scoreboard players add @e[tag=doomed_zap] strikedl 1
execute as @e[tag=doomed_zap] at @s run fill ~-2 ~-1 ~-2 ~2 ~1 ~2 frosted_ice [] replace water
execute as @e[tag=doomed_zap] at @s run fill ~-2 ~-1 ~-2 ~2 ~1 ~2 frosted_ice [] replace flowing_water
execute as @e[tag=doomed_zap,scores={strikedl=10..},c=5] at @s run summon lightning_bolt ~ ~ ~
execute as @e[tag=doomed_zap,scores={strikedl=10..}] at @s run damage @s 20 magic
execute as @e[tag=doomed_zap,scores={strikedl=10..}] at @s run particle minecraft:huge_explosion_emitter ~ ~1 ~
execute as @e[tag=doomed_zap,scores={strikedl=10..}] at @s run playsound random.explode @a ~ ~ ~ 1 1
execute as @e[tag=doomed_zap,scores={strikedl=10..}] at @s run particle minecraft:electric_spark ~ ~2 ~
execute as @e[tag=doomed_zap,scores={strikedl=10..}] at @s run tag @e[family=monster,type=!player,r=5,c=1,rm=0.1] add doomed_zap
execute as @e[tag=doomed_zap,scores={strikedl=10..}] at @s run scoreboard players set @s strikedl 0
kill @e[type=zk:greatvoltlightningstriker,scores={strikedl=6..}]
kill @e[type=zk:voltlightningstriker,scores={strikedl=6..}]
execute as @a[tag=detonating] at @s run event entity @e[type=zk:greaterlightningmagiccircle] power:release
execute as @a[tag=feed_absorbing] at @s run kill @e[family=projectile,r=5]