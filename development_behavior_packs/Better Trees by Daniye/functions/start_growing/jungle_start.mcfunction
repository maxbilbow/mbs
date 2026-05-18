tag @e[type=item] add item_jungle_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 air replace composter ["composter_fill_level"=8]
tag @e[type=item,tag=!item_jungle_start] add composter_jungle_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 composter ["composter_fill_level"=8] replace daniye:jungle_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 daniye:jungle_start replace composter ["composter_fill_level"=8]
execute at @e[type=item,tag=composter_jungle_start] run setblock ~~~ composter ["composter_fill_level"=8]
execute at @e[type=item,tag=!item_jungle_start,tag=!composter_jungle_start] align xyz positioned ~0.5~0.5~0.5 run execute unless entity @e[type=daniye:jungle_tree,r=1] run summon daniye:jungle_tree ~~-0.5~
kill @e[type=item,tag=!item_jungle_start]