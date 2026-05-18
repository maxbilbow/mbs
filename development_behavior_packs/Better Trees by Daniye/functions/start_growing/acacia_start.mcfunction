tag @e[type=item] add item_acacia_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 air replace composter ["composter_fill_level"=8]
tag @e[type=item,tag=!item_acacia_start] add composter_acacia_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 composter ["composter_fill_level"=8] replace daniye:acacia_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 daniye:acacia_start replace composter ["composter_fill_level"=8]
execute at @e[type=item,tag=composter_acacia_start] run setblock ~~~ composter ["composter_fill_level"=8]
execute at @e[type=item,tag=!item_acacia_start,tag=!composter_acacia_start] align xyz positioned ~0.5~0.5~0.5 run execute unless entity @e[type=daniye:acacia_tree,r=1] run summon daniye:acacia_tree ~~-0.5~
kill @e[type=item,tag=!item_acacia_start]