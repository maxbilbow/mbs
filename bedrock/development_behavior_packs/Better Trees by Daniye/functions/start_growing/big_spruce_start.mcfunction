tag @e[type=item] add item_big_spruce_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 air replace composter ["composter_fill_level"=8]
tag @e[type=item,tag=!item_big_spruce_start] add composter_big_spruce_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 composter ["composter_fill_level"=8] replace daniye:big_spruce_start
execute at @a run fill ~20~8~20 ~-20~-4~-20 daniye:big_spruce_start replace composter ["composter_fill_level"=8]
execute at @e[type=item,tag=composter_big_spruce_start] run setblock ~~~ composter ["composter_fill_level"=8]
execute at @e[type=item,tag=!item_big_spruce_start,tag=!composter_big_spruce_start] align xyz positioned ~0.5~0.5~0.5 run execute unless entity @e[type=daniye:big_spruce_tree,r=1] run summon daniye:big_spruce_tree ~~-0.5~
kill @e[type=item,tag=!item_big_spruce_start]