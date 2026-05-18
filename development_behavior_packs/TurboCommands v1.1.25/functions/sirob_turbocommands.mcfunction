tag @s add sirob:no-access
tag @s[tag=sirob:turbocommands] remove sirob:no-access

tag @s[tag=sirob:no-access] add sirob:turbocommands
playsound random.levelup @s[tag=sirob:no-access] ~~~ 0.5 2.0
tellraw @s[tag=sirob:no-access] {"rawtext":[{"text":"§aYou have been granted access to §dTurbo Commands"}]}
give @s[tag=sirob:no-access] sirob:turbo_commands

tag @s[tag=!sirob:no-access] remove sirob:turbocommands
playsound block.false_permissions @s[tag=!sirob:no-access]
tellraw @s[tag=!sirob:no-access] {"rawtext":[{"text":"§cYou no longer have access to §dTurbo Commands"}]}
clear @s[tag=!sirob:no-access] sirob:turbo_commands

tag @s[tag=sirob:no-access] remove sirob:no-access