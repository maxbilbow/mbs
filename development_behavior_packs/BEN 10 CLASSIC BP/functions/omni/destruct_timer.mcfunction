event entity @s[scores={omni_destruct=0}] omni_destruct_blink1
scoreboard players add @s[scores={omni_destruct=0..}] omni_destruct 1
title @s[scores={omni_destruct=0..20}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c30
title @s[scores={omni_destruct=20..40}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c29
title @s[scores={omni_destruct=40..60}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c28
title @s[scores={omni_destruct=60..80}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c27
title @s[scores={omni_destruct=80..100}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c26
title @s[scores={omni_destruct=100..120}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c25
title @s[scores={omni_destruct=120..140}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c24
title @s[scores={omni_destruct=140..160}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c23
title @s[scores={omni_destruct=160..180}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c22
title @s[scores={omni_destruct=180..200}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c21
title @s[scores={omni_destruct=200..220}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c20
title @s[scores={omni_destruct=220..240}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c19
title @s[scores={omni_destruct=240..260}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c18
title @s[scores={omni_destruct=260..280}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c17
title @s[scores={omni_destruct=280..300}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c16
title @s[scores={omni_destruct=300..320}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c15
title @s[scores={omni_destruct=320..340}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c14
title @s[scores={omni_destruct=340..360}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c13
title @s[scores={omni_destruct=360..380}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c12
title @s[scores={omni_destruct=380..400}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c10
title @s[scores={omni_destruct=400..420}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c9
title @s[scores={omni_destruct=420..440}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c8
title @s[scores={omni_destruct=440..460}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c7
title @s[scores={omni_destruct=460..480}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c6
title @s[scores={omni_destruct=480..500}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c5
title @s[scores={omni_destruct=500..520}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c4
title @s[scores={omni_destruct=520..540}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c3
title @s[scores={omni_destruct=540..560}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c2
title @s[scores={omni_destruct=560..580}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c1
title @s[scores={omni_destruct=580..}] actionbar §r§eOmnitrix Self-destruct in§7 - §l§c0
event entity @s[scores={omni_destruct=600..}] reset
effect @s[scores={omni_destruct=600..}] resistance 2 3 true
execute as @s[scores={omni_destruct=600..}] at @s run scriptevent omni:self_destruct
clear @s[scores={omni_destruct=600..}] omni:omni_icon
replaceitem entity @s[scores={omni_destruct=600..}] slot.hotbar 0 air
scoreboard players reset @s[scores={omni_destruct=600..}] omni_destruct