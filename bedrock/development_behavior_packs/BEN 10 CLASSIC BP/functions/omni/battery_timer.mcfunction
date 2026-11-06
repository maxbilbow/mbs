scoreboard players reset @s[m=c] omni_off
scoreboard players set @s[tag=master_control] omni_off 0
scoreboard players add @s[tag=alien,m=!c,tag=!master_control,scores={omni_off=0..}] omni_off 1
playsound omni2.off @s[scores={omni_off=4000},tag=has_omni2]
playsound omni.off @s[scores={omni_off=4000},tag=!has_omni2]
execute as @s[scores={omni_off=4000..},family=ditto] at @s run event entity @e[type=omni:ditto_clone] despawn
event entity @s[scores={omni_off=4000..},tag=!has_omni2] omnitrix_off
event entity @s[scores={omni_off=4000..},tag=has_omni2] omni2_off
scoreboard players set @s[scores={omni_off=4000..}] omni_charge 1
scoreboard players reset @s[scores={omni_off=4000..}] omni_off
scoreboard players add @s[tag=!alien,scores={omni_charge=1..}] omni_charge 1
execute as @s[m=c,scores={omni_charge=1..}] at @s run function omni/charge
event entity @s[scores={omni_charge=390..},tag=!has_omni2] omnitrix
event entity @s[scores={omni_charge=390..},tag=has_omni2] enable_omni2
playsound omni.charged @s[scores={omni_charge=390..}] ~ ~ ~ 1 2.0
scoreboard players reset @s[scores={omni_charge=390..}] omni_charge