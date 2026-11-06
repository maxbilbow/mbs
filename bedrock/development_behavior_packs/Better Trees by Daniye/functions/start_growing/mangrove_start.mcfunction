tag @e[type=item] add item_mangrove_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 air replace composter ["composter_fill_level"=8]
tag @e[type=item,tag=!item_mangrove_start] add composter_mangrove_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 composter ["composter_fill_level"=8] replace daniye:mangrove_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 daniye:mangrove_start replace composter ["composter_fill_level"=8]
execute at @e[type=item,tag=composter_mangrove_start] run setblock ~~~ composter ["composter_fill_level"=8]
execute at @e[type=item,tag=!item_mangrove_start,tag=!composter_mangrove_start] align xyz positioned ~0.5~0.5~0.5 run execute unless entity @e[type=daniye:mangrove_tree,r=1] run summon daniye:mangrove_tree ~~-0.5~
kill @e[type=item,tag=!item_mangrove_start]