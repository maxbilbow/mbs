import { world, system, EntityDamageCause } from "@minecraft/server"
import * as Vec3 from 'utils/vec3.js'


/**
 * @param {String} projectileId 
 * @param {Dimension} dimension 
 * @param {Location} location 
 * @param {Vector3} direction 
 * @param {Number} velocityMultiplier 
 * @param {Number} uncertainty 
 */
export function shootProjectile(projectileId, dimension, location, direction, velocityMultiplier = 0.5, uncertainty = 0) {
    let velocity = { x: direction.x * velocityMultiplier, y: direction.y * velocityMultiplier, z: direction.z * velocityMultiplier };
    const projectile = dimension.spawnEntity(projectileId, location);
    const projectileComp = projectile.getComponent('minecraft:projectile');

    projectileComp?.shoot(velocity, {
        uncertainty: uncertainty,
    });
    //return projectile;
}



world.afterEvents.playerButtonInput.subscribe(ev => {
    const player = ev.player

    const ridingComp = player.getComponent("riding")
    const entity = ridingComp?.entityRidingOn
    if (entity?.typeId == 'eu:tanquini' || entity?.typeId == 'eu:bombardino_cocodrilo') {
        const button = ev.button
        const buttonState = ev.newButtonState

        if (button == 'Jump' && buttonState == 'Pressed') {
            //world.sendMessage('bang')
            shootProjectile('eu:thrown_brainrot_bomb', entity.dimension, Vec3.getLocalCoordinates(player, { x: 3, y: 1, z: 0 }), entity.getViewDirection(), 1.25)
            //projectile.setRotation(player.getRotation())
        }
    }


})

system.runInterval(() => {
    const players = world.getAllPlayers()

    for (const player of players) {
        //world.sendMessage(player.getViewDirection().y.toString())
        let entity = player.getComponent("riding")?.entityRidingOn;
        if (entity?.typeId == 'eu:bombardino_cocodrilo') {
            const direction = {
                x: 0,
                y: player.getViewDirection().y >= 0.3 ? 0.1 : 0.07,
                z: 0,
            };

            if (!entity.isOnGround) {
                entity.addEffect("speed", 5, {
                    showParticles: false,
                    amplifier: 5,
                });
            }

            entity.applyImpulse(direction);
        }
    }
});

world.beforeEvents.chatSend.subscribe(ev => {
    const { message, sender } = ev
    //world.sendMessage("ahhh")
    if (!message.startsWith('!')) { return }
    ev.cancel = true
    if (message == '!start') {
        const { dimension, location } = sender
        const entity = dimension.getEntities({ closest: 1, location: location, maxDistance: 1000, type: "eu:herios" })[0]
        if (entity) {
            sender.sendMessage("§c¡Solo puede existir un Herios cada 1000 bloques!")
            sender.sendMessage("§6There can only be one Herios every 1000 blocks!")
        } else {
            system.run(() => {
                dimension.spawnEntity('eu:herios', location)

            })
            sender.sendMessage('§aHas generado a Herios, el comerciante de Italian Brain Rots, dale Click derecho.')
            sender.sendMessage('You have spawned Herios, the Italian Brain Rots merchant, right click on him.')
        }


    }
})

world.afterEvents.playerSpawn.subscribe(ev => {
    const { player, initialSpawn } = ev
    if (initialSpawn && !player.hasTag('eu:lobby_message')) {
        const systemId = system.runInterval(() => {
            const velocity = player.getVelocity()
            if (velocity.x > 0 || velocity.y > 0 || velocity.z > 0) {
                //player.sendMessage('§e¡Gracias por adquirir este mod en nuestro patreon! §6www.patreon.com/soyHerios')
                //player.sendMessage("§eThanks for purchasing this mod on our Patreon! §6www.patreon.com/soyHerios")

                player.sendMessage("§6Execute !start to begin the adventure.")
                player.addTag('eu:lobby_message')
                system.clearRun(systemId)
            }
        })

    }
})

world.afterEvents.entitySpawn.subscribe(ev => {
    const { entity } = ev
    if (entity.typeId == 'eu:herios') {
        entity.nameTag = "Herios, Brain Rot Seller"
    }
})


world.afterEvents.entityDie.subscribe(ev => {
    const { deadEntity } = ev
    if (deadEntity.typeId == "eu:herioscuino_tanquini") {
        const { location, dimension } = deadEntity
        dimension.spawnEntity("eu:tanquini", location)
    }
})


world.afterEvents.projectileHitEntity.subscribe(ev => {
    const { projectile } = ev
    if (projectile.typeId == 'eu:thrown_honey_projectile') {
        const entity = ev.getEntityHit().entity
        entity.addEffect('slowness', 20 * 6, { amplifier: 0, showParticles: true })
    } else if (projectile.typeId == 'eu:thrown_brainrot_bomb') {
        const entity = ev.getEntityHit().entity
        const { dimension, location } = entity
        dimension.spawnParticle('minecraft:large_explosion', { x: location.x, y: location.y + 1, z: location.z })
    }
})


world.afterEvents.entityHurt.subscribe(ev => {
    const { damageSource, hurtEntity } = ev
    const entity = damageSource.damagingEntity
    if (entity?.typeId == 'eu:bombombini_guzini') {
        const { location, dimension } = entity
        dimension.createExplosion(location, 1, { breaksBlocks: false })
    } else if (entity?.typeId == 'eu:nuclearo_dinossauro') {
        const { location, dimension } = entity
        dimension.createExplosion(location, 4, { breaksBlocks: true })
    } else if (entity?.typeId == 'eu:trictrac_barabum') {
        entity.applyKnockback({ x: 0, z: 0 }, 1)
    } else if (entity?.typeId == 'eu:trenostruzzoturbo3000') {
        hurtEntity.setOnFire(5)
    } else if (entity?.typeId == 'eu:bulbitobanditotraktorito') {
        hurtEntity.runCommand("summon lightning_bolt")
    }
})

world.afterEvents.dataDrivenEntityTrigger.subscribe(ev => {
    const { entity, eventId } = ev
    if (entity.typeId == 'eu:ballerino_lololo' && eventId == 'eu:start_special_attack') {
        const systemID = system.runInterval(() => {
            const target = entity.target
            if (target) {
                entity.lookAt(target.location)
                //world.sendMessage('detentando')
                const entitiesView = entity.getEntitiesFromViewDirection({ maxDistance: 30 })
                entitiesView.forEach(entityView => {
                    const entity = entityView.entity
                    entity.applyDamage(7, { cause: EntityDamageCause.sonicBoom, damagingEntity: entity })
                })
            }
        })
        system.runTimeout(() => {
            system.clearRun(systemID)
        }, 38)
    }
})


/* 
world.afterEvents.entityHitEntity.subscribe(ev => {
    const { hitEntity } = ev
    world.sendMessage(hitEntity.typeId)
    world.sendMessage(hitEntity.getProperty('eu:is_lit').toString())

}) */


/* 
system.runInterval(() => {
    const players = world.getAllPlayers()

    for (const player of players) {
        let entity = player.getComponent("riding")?.entityRidingOn;
        if (entity?.typeId == 'eu:tralalero_tralala') {
            const rotation = player.getRotation()
            entity.setProperty('eu:rider_rotation', rotation.y)
        }
    }
});
 */