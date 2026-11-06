gamerule commandblockoutput false
summon drowned
replaceitem entity @e[type=skeleton,r=1.3] slot.weapon.mainhand 0 iron_sword
enchant @e[r=1.3,type=skeleton] sharpness 2
setblock ~~~ air
effect @e[type=skeleton,r=1.3] health_boost 100000 3 true
effect @e[type=skeleton,r=1.3] resistance 100000 0 true
effect @e[type=skeleton,r=1.3] instant_damage 1 255 true