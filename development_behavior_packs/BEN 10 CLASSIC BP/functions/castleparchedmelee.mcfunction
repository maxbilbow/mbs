gamerule commandblockoutput false
summon parched
replaceitem entity @e[type=parched,r=1.3] slot.armor.head 0 iron_helmet
replaceitem entity @e[type=parched,r=1.3] slot.armor.chest 0 iron_chestplate
replaceitem entity @e[type=parched,r=1.3] slot.armor.legs 0 iron_leggings
replaceitem entity @e[type=parched,r=1.3] slot.armor.feet 0 iron_boots
replaceitem entity @e[type=parched,r=1.3] slot.weapon.mainhand 0 iron_sword
setblock ~~~ air
effect @e[type=parched,r=1.3] health_boost 100000 3 true
effect @e[type=parched,r=1.3] resistance 100000 0 true
effect @e[type=parched,r=1.3] instant_damage 1 255 true