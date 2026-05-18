tag @s add master_control
scoreboard objectives add omni_random dummy
execute as @s[scores={aliens=..9}] at @s run scoreboard players random @s omni_random 1 9
execute as @s[scores={aliens=10}] at @s run scoreboard players random @s omni_random 1 10
execute as @s[scores={aliens=11}] at @s run scoreboard players random @s omni_random 1 11
execute as @s[scores={aliens=12}] at @s run scoreboard players random @s omni_random 1 12
execute as @s[scores={aliens=13}] at @s run scoreboard players random @s omni_random 1 13
execute as @s[scores={aliens=14}] at @s run scoreboard players random @s omni_random 1 14
execute as @s[scores={aliens=15}] at @s run scoreboard players random @s omni_random 1 15
execute as @s[scores={aliens=16}] at @s run scoreboard players random @s omni_random 1 16
execute as @s[scores={aliens=17..}] at @s run scoreboard players random @s omni_random 1 17
execute as @s[scores={omni_random=1}] at @s run event entity @s heatblast
execute as @s[scores={omni_random=2}] at @s run event entity @s wildmutt
execute as @s[scores={omni_random=3}] at @s run event entity @s diamondhead
execute as @s[scores={omni_random=4}] at @s run event entity @s xlr8
execute as @s[scores={omni_random=5}] at @s run event entity @s greymatter
execute as @s[scores={omni_random=6}] at @s run event entity @s fourarms
execute as @s[scores={omni_random=7}] at @s run event entity @s stinkfly
execute as @s[scores={omni_random=8}] at @s run event entity @s ripjaws
execute as @s[scores={omni_random=9}] at @s run event entity @s ghostfreak
execute as @s[scores={omni_random=10}] at @s run event entity @s cannonbolt
execute as @s[scores={omni_random=11}] at @s run event entity @s ditto
execute as @s[scores={omni_random=12}] at @s run event entity @s waybig
execute as @s[scores={omni_random=13}] at @s run event entity @s upgrade
execute as @s[scores={omni_random=14}] at @s run event entity @s wildvine
execute as @s[scores={omni_random=15}] at @s run event entity @s benwolf
execute as @s[scores={omni_random=16}] at @s run event entity @s benmummy
execute as @s[scores={omni_random=17}] at @s run event entity @s eyeguy