scoreboard players reset @s[m=c] omni_off
scoreboard players set @s[tag=master_control] omni_off 0
scoreboard players add @s[family=alien,m=!c,tag=!master_control,scores={omni_off=0..}] omni_off 1
playsound omni.off @s[scores={omni_off=4000}]
event entity @s[scores={omni_off=4000..}] omnitrix_off
scoreboard players set @s[scores={omni_off=4000..}] omni_charge 1
scoreboard players reset @s[scores={omni_off=4000..}] omni_off
scoreboard players add @s[family=!alien,scores={omni_charge=1..}] omni_charge 1
execute as @s[m=c,scores={omni_charge=1..}] at @s run function omni/charge
event entity @s[scores={omni_charge=390..}] omnitrix
playsound omni.charged @s[scores={omni_charge=390..}] ~ ~ ~ 1 2.0
scoreboard players reset @s[scores={omni_charge=390..}] omni_charge