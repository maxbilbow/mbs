execute as @e[family=boss] run execute at @s run tp @s[family=boss] ^^^1 facing @e[c=1,r=16,type=projectile:primordial_dash_thing]
particle primordialdashthing
damage @e[family=!boss,r=5] 12 contact entity @n[type=boss:primordial_wyrm]
summon projectile:primordial_light ~~2~ facing @r[r=64]