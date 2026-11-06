tag @e[type=item] add item_spruce_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 air replace composter ["composter_fill_level"=8]
tag @e[type=item,tag=!item_spruce_start] add composter_spruce_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 composter ["composter_fill_level"=8] replace daniye:spruce_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 daniye:spruce_start replace composter ["composter_fill_level"=8]
execute at @e[type=item,tag=composter_spruce_start] run setblock ~~~ composter ["composter_fill_level"=8]
execute at @e[type=item,tag=!item_spruce_start,tag=!composter_spruce_start] align xyz positioned ~0.5~0.5~0.5 run execute unless entity @e[type=daniye:spruce_tree,r=1] run summon daniye:spruce_tree ~~-0.5~
kill @e[type=item,tag=!item_spruce_start]