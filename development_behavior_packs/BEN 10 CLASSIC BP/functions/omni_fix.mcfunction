tag @s remove alien
tag @s remove master_control
tag @s remove omni_using
tag @s remove failsafe_check
tag @s remove sneaking
tag @s remove flying
tag @s remove jetpack_flying
tag @s remove is_custom_flying
tag @s remove is_fast_forwarding
tag @s remove in_water_rj
tag @s remove rj_raining
event entity @s reset
event entity @s omnitrix_off
effect @s clear
clear @s omni:omni_icon
clear @s omni:omni_off
clear @s omni:omni_master
scoreboard players set @s omni_charge 1
scoreboard players set @s omni_off 0
scoreboard players set @s omni_menu_option 0
playsound random.levelup @s ~ ~ ~ 1.0 1.0
titleraw @s actionbar {"rawtext":[{"text":"§l§a> SYSTEM REBOOTED <"}]}