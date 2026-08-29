playsound omni2.off @s[tag=alien,tag=has_omni2]
playsound omni.off @s[tag=alien,tag=!has_omni2]
event entity @s[m=c] reset
event entity @s[m=c] omnitrix
ride @s stop_riding
effect @s clear
execute as @s[family=waybig] at @s run event entity @e[c=1,type=player:waybig_height] despawn
execute as @s[family=ditto] at @s run event entity @e[type=omni:ditto_clone] despawn
scoreboard players reset @s[m=!c,tag=alien] omni_off
scoreboard players add @s[m=!c,tag=alien] omni_off 4000
tag @s[m=s] add ms
tag @s[m=a] add ma
gamemode c
gamemode s @s[tag=ms]
gamemode a @s[tag=ma]
tag @s remove ms
tag @s remove ma
tag @s remove master_control