tag @e[type=item] add item_cherry_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 air replace composter ["composter_fill_level"=8]
tag @e[type=item,tag=!item_cherry_start] add composter_cherry_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 composter ["composter_fill_level"=8] replace daniye:cherry_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 daniye:cherry_start replace composter ["composter_fill_level"=8]
execute at @e[type=item,tag=composter_cherry_start] run setblock ~~~ composter ["composter_fill_level"=8]
execute at @e[type=item,tag=!item_cherry_start,tag=!composter_cherry_start] align xyz positioned ~0.5~0.5~0.5 run execute unless entity @e[type=daniye:cherry_tree,r=1] run summon daniye:cherry_tree ~~-0.5~
kill @e[type=item,tag=!item_cherry_start]