particle lumenylbubbles
effect @e[r=3,rm=0.2] water_breathing 2 0
effect @e[r=1,family=nautilus] speed 2 15 true
effect @e[r=1,family=horse] speed 2 15 true
effect @e[r=1,family=mule] speed 2 15 true
effect @e[r=1,family=donkey] speed 2 15 true
effect @e[r=1,family=strider] speed 2 15 true
effect @e[r=1,family=camel] speed 2 15 true
effect @e[r=1,family=happy_ghast] speed 2 15 true
effect @e[r=1,family=mob:juvenile_pet_wyrm] speed 2 15 true
effect @e[r=1,family=nautilus] slow_falling 2 15 true
effect @e[r=1,family=horse] slow_falling 2 15 true
effect @e[r=1,family=mule] slow_falling 2 15 true
effect @e[r=1,family=donkey] slow_falling 2 15 true
effect @e[r=1,family=strider] slow_falling 2 15 true
effect @e[r=1,family=camel] slow_falling 2 15 true
effect @e[r=1,family=happy_ghast] slow_falling 2 15 true
effect @e[r=1,family=mob:juvenile_pet_wyrm] slow_falling 2 15 true
effect @e[r=4,type=mob:merfolk,hasitem=[{item=item:adoption_bracelet,location=slot.weapon.offhand}]] slow_falling 2 15 true
execute at @s if block ~~~ water run effect @s resistance 2 1
execute at @s if block ~~~ water run effect @s strength 2 1