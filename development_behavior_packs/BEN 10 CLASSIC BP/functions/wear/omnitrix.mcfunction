clear @s[family=!omnitrix,family=!alien] omni:omnitrix 0 1
event entity @s[family=!omnitrix,family=!alien] omnitrix
event entity @s[family=!omnitrix,family=!alien] omnitrix
scoreboard objectives add aliens dummy
scoreboard players add @s aliens 0
scoreboard players add @s[scores={aliens=0},tag=!aliens_locked] aliens 9
scoreboard objectives add rz_failsafe dummy
scoreboard players add @s rz_failsafe 0
replaceitem entity @s[tag=!master_control] slot.hotbar 0 omni:omni_icon 1 0 {"keep_on_death": {},"item_lock": {"mode": "lock_in_slot"}}
replaceitem entity @s[tag=master_control] slot.hotbar 8 omni:omni_master 1 0 {"keep_on_death": {},"item_lock": {"mode": "lock_in_slot"}}