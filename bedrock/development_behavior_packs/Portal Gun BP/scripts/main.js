import {
  ItemStack,
  EquipmentSlot,
  world,
  system,
  PlayerInventoryType,
  EntitySwingSource,
  HeldItemOption,
  InputButton,
  ButtonState,
} from "@minecraft/server";

import { floatingProjectiles, highPressureShots, summonPortal, usePortalGun } from "./portal/portalGun";

import {
  linkPortals,
  removePortal,
  dealPortalFluidDamage,
  setChargeBar,
  clearChargeBar,
  isPortalGun,
  getSelectedItem,
  savePortalList,
  findPortalGunInInventory,
} from "./utils/utils";

import {
  ID,
  portalGuns,
  portalGunDP,
  portalSP,
  portalDP
} from "./utils/ids&variables";

import { runCooldown, onTick, handleTags , handlePortalFluids} from "./portal/teleport";
import { onBlenderVictimDie, releaseBlenderLock } from "./portal/blender";
import { canUseGun, hasShockStun, releaseShockStun, shockPlayer } from "./portal/security";
import { clearStaleChunkAreas, sweepChunkAreas } from "./portal/chunkLoader";
import { sweepGunDisplays, toggleGunDisplayDebug } from "./gui/gunDisplay";

import * as tr from "./ram_pg/triggers";

// ==== DEBUG  ====
import { dumpDebugState, resetAddonState } from "./debug_dump";
system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id === "ram_pg:debug") {
    dumpDebugState(event.sourceEntity);
  } else if (event.id === "ram_pg:reset") {
    resetAddonState();
  } else if (event.id === "ram_pg:gun_display_debug") {
    const visible = toggleGunDisplayDebug();
    event.sourceEntity?.sendMessage(`[ram_pg] gun display debug: ${visible}`);
  }
});

/**
 * Runs `fn` and swallows/logs any error so the enclosing system.runInterval
 * is never permanently killed by an uncaught exception.
 */
function safeTick(fn, label) {
  try {
    fn();
  } catch (e) {
    console.error(`[ram_pg] Uncaught error in ${label}:`, e);
  }
}

system.runInterval(() => {
  safeTick(runCooldown, "runCooldown");
  safeTick(onTick, "onTick");
}, 1);

system.runInterval(() => {
  safeTick(handleTags, "handleTags");
}, 5);

system.runInterval(() => {
  safeTick(handlePortalFluids, "handlePortalFluids");
  safeTick(sweepChunkAreas, "sweepChunkAreas");
  safeTick(sweepGunDisplays, "sweepGunDisplays");
}, 20);

system.run(() => {
  safeTick(clearStaleChunkAreas, "clearStaleChunkAreas");
});

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  tr.beforePlayerInteractWithBlock(event);
});

world.beforeEvents.entityHurt.subscribe((event) => {
  const damageSource = event.damageSource;
  const hurtEntity = event.hurtEntity;
  const location = hurtEntity.location;

  if (damageSource.cause !== "fall") return;

  const entitiesNearby = hurtEntity.dimension.getEntities({
    location,
    maxDistance: 3,
    families: ["ram_pg:portal"],
  });

  const isPortalLinked = entitiesNearby.some((portal) => {
    if (portal.getProperty(portalSP.isLinked) !== true) return false;

    const scale = portal.getProperty(portalSP.scale);
    const radius = 1 * scale;

    const dx = hurtEntity.location.x - portal.location.x;
    const dy = hurtEntity.location.y - portal.location.y;
    const dz = hurtEntity.location.z - portal.location.z;

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return distance <= radius;
  });

  if (isPortalLinked) {
    event.cancel = true;
  }
});

world.beforeEvents.effectAdd.subscribe((event) => {
  tr.beforeEffectAdd(event);
});


/* Watch slot change to set charge bar */
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((event) => {
  const player = event.player;

  const inventory = player.getComponent("inventory").container;

  const previousItem = inventory.getItem(event.previousSlotSelected);
  const newItem = inventory.getItem(event.newSlotSelected);

  const previousWasGun = isPortalGun(previousItem?.typeId);
  const newIsGun = isPortalGun(newItem?.typeId);

  const previousHadChargeBar =
    previousWasGun &&
    previousItem.getDynamicProperty(portalGunDP.behavior.chargeBar);

  // Clear only when switching from a gun that had the charge bar showing
  if (previousWasGun && !newIsGun) {
    if (previousHadChargeBar) clearChargeBar(player);
    return;
  }

  if (!newIsGun) return;

  const isChargeBarOn = newItem.getDynamicProperty(
    portalGunDP.behavior.chargeBar,
  );

  if (!isChargeBarOn) {
    if (previousHadChargeBar) clearChargeBar(player);
    return;
  }

  setChargeBar(player, newItem);
});

/* Watch inventory change to set charge bar */
world.afterEvents.playerInventoryItemChange.subscribe(
  ({ player, itemStack, beforeItemStack }) => {
    const currentIsGun = isPortalGun(itemStack?.typeId);
    const previousIsGun = isPortalGun(beforeItemStack?.typeId);

    // Not switching to or from a gun, do nothing
    if (!currentIsGun && !previousIsGun) return;

    const previousHadChargeBar =
      previousIsGun &&
      beforeItemStack.getDynamicProperty(portalGunDP.behavior.chargeBar);

    // Switched from a gun that had the charge bar showing to a non-gun, clear and exit
    if (previousIsGun && !currentIsGun) {
      if (previousHadChargeBar) clearChargeBar(player);
      return;
    }

    const selectedItem = getSelectedItem(player);

    if (!isPortalGun(selectedItem?.typeId)) return;

    const isChargeBarOn = selectedItem.getDynamicProperty(
      portalGunDP.behavior.chargeBar,
    );
    if (isChargeBarOn) setChargeBar(player, selectedItem);
  },
);

//Used to detect when the player interacts with a portal gun.
world.afterEvents.itemUse.subscribe((event) => {
  const { itemStack, source: player } = event;

  // Ignore the event if the item is not a Portal Gun, discharged gun, or base component
  if (
    !ID.portalGunsIds.includes(itemStack.typeId) &&
    !ID.dischargedPortalGuns.includes(itemStack.typeId) &&
    !ID.components.portalGunBases.includes(itemStack.typeId)
  ) {
    return;
  }

  // If the item used is a Portal Gun base
  if (ID.components.portalGunBases.includes(itemStack.typeId)) {
    const equippable = player.getComponent("minecraft:equippable");
    const itemOffhand = equippable.getEquipment(EquipmentSlot.Offhand);
    if (
      itemOffhand === undefined ||
      (!ID.components.chargedTubes.includes(itemOffhand.typeId) &&
        !ID.components.emptyTubes.includes(itemOffhand.typeId))
    ) {
      player.onScreenDisplay.setActionBar({
        translate: "ram_pg.assemble_portal_gun",
      });
      return;
    }

    const gunInstance = portalGuns.find(
      (gun) =>
        gun.baseId === itemStack.typeId &&
        (gun.emptyTubeId === itemOffhand?.typeId ||
          gun.chargedTubeId === itemOffhand?.typeId),
    );

    if (gunInstance === undefined) {
      player.onScreenDisplay.setActionBar({
        translate: "ram_pg.incompatible_fluid",
      });
      return;
    }

    // Determine which gun type to create based on the tube in the offhand
    let newGunType;
    if (itemOffhand?.typeId === gunInstance.chargedTubeId) {
      newGunType = gunInstance.typeId;
    } else if (itemOffhand?.typeId === gunInstance.emptyTubeId) {
      newGunType = gunInstance.dischargedVersionId;
    }

    if (!newGunType) return; // if tube doesn't match, do nothing

    const inventory = player.getComponent("inventory").container;
    const portalGun = new ItemStack(newGunType, 1);

    // Copy dynamic properties from the base to the new gun
    for (const id of itemStack.getDynamicPropertyIds()) {
      portalGun.setDynamicProperty(id, itemStack.getDynamicProperty(id));
    }

    // Set the charge depending on the tube type
    if (ID.components.chargedTubes.includes(itemOffhand.typeId)) {
      const currentCharge =
        itemOffhand.getDynamicProperty(portalGunDP.charge) ?? 100;
      portalGun.setDynamicProperty(portalGunDP.charge, currentCharge);
    } else if (ID.components.emptyTubes.includes(itemOffhand.typeId)) {
      portalGun.setDynamicProperty(portalGunDP.charge, 0);
    }

    // Consume one tube from offhand
    if (itemOffhand.amount > 1) {
      itemOffhand.amount -= 1;
      equippable.setEquipment(EquipmentSlot.Offhand, itemOffhand);
    } else {
      equippable.setEquipment(EquipmentSlot.Offhand, undefined);
    }

    // Replace base with assembled Portal Gun and play plug sound
    inventory.setItem(player.selectedSlotIndex, portalGun);
    player.playAnimation("animation.ram_pg.player.portal_gun_plug", {
      blendOutTime: 1,
    });
    player.dimension.playSound("ram_pg:portal_gun_plug", player.location);
    return;
  }

  const portalGunTypeId = itemStack.typeId;

  const cooldownName = portalGunTypeId.replace("ram_pg:", "") + "_cooldown";
  const cooldownComponent = itemStack.getComponent("cooldown");
  const cooldown = player.getItemCooldown(cooldownName);
  const cooldownTicks = cooldownComponent.cooldownTicks;

  if (cooldown < cooldownTicks - 1) {
    return;
  }

  usePortalGun(player, itemStack);
});

// It allows Portal Gun projectiles to hit entities and give them poison effect.
world.afterEvents.projectileHitEntity.subscribe((event) => {
  highPressureShots.delete(event.projectile?.id);
  tr.projectileHitEntity(event);
  if (!ID.projectiles.includes(event.projectile.typeId)) {
    return;
  }

  const hitEntity = event.getEntityHit()?.entity;
  if (ID.portals.includes(hitEntity?.typeId)) {
    return;
  }

  dealPortalFluidDamage(hitEntity, event.projectile.typeId);
});

// It is used to detect when a Portal Gun projectile lands on a block
// and then summon a portal at the hit location.
world.afterEvents.projectileHitBlock.subscribe((event) => {
  const projectile = event.projectile;

  if (!ID.projectiles.includes(projectile.typeId)) {
    return;
  }

  if(floatingProjectiles.has(projectile.id)){
    floatingProjectiles.delete(projectile.id);
  }
  highPressureShots.delete(projectile.id);

  const player = event.source;
  summonPortal(player, event.getBlockHit(), projectile.typeId);
});

/*
  Allow players to remove portals by hitting them with a Portal Gun.
*/
world.afterEvents.entityHitEntity.subscribe((event) => {
  if (event.damagingEntity.typeId !== "minecraft:player") return;
  const player = event.damagingEntity;
  const portalEntity = event.hitEntity;
  if (!portalEntity.matches({ families: ["ram_pg:portal"] })) return;

  const inventory = player.getComponent("inventory");
  const portalGunItem = inventory.container.getItem(player.selectedSlotIndex);

  if (!portalGunItem) return;
  if (
    !ID.portalGunsIds.includes(portalGunItem.typeId) &&
    !ID.dischargedPortalGuns.includes(portalGunItem.typeId) &&
    !ID.components.portalGunBases.includes(portalGunItem.typeId)
  )
    return;
  if (!canUseGun(player, portalGunItem)) {
    shockPlayer(player, player.selectedSlotIndex);
    return;
  }

  const removedIds = [];

  function finishRemoval() {
    if (removedIds.length === 0) return;
    const portalGunId = portalGunItem.getDynamicProperty(portalGunDP.id);
    const currentItemObject = findPortalGunInInventory(player, portalGunId);
    if (!currentItemObject) return;
    const portalListJson = currentItemObject.item.getDynamicProperty(
      portalGunDP.portalList,
    );
    const portalIds = portalListJson ? JSON.parse(portalListJson) : [];
    const remaining = portalIds.filter((id) => !removedIds.includes(id));
    if (remaining.length !== portalIds.length) {
      savePortalList(
        currentItemObject.item,
        remaining,
        player,
        inventory,
        currentItemObject.slotIndex,
      );
    }
  }

  const portalIsRoot = portalEntity.getDynamicProperty(portalDP.isRoot);

  if (
    portalIsRoot === undefined ||
    portalEntity.getDynamicProperty(portalDP.DualityPortalId) === undefined
  ) {
    const dualId = portalEntity.getDynamicProperty(portalDP.DualityPortalId);
    removedIds.push(portalEntity.id);
    if (dualId) removedIds.push(dualId);
    removePortal(portalEntity, true);
    return finishRemoval();
  }
  const dualPortal = world.getEntity(
    portalEntity.getDynamicProperty(portalDP.DualityPortalId),
  );
  if (dualPortal === undefined) {
    removedIds.push(portalEntity.id);
    removePortal(portalEntity, false);
    return finishRemoval();
  }
  const rootPortal = portalIsRoot ? portalEntity : dualPortal;
  const childListJson = rootPortal.getDynamicProperty(portalDP.childList);
  const childList = childListJson ? JSON.parse(childListJson) : [];

  if (childList.length > 2) {
    if (portalIsRoot) {
      childList.forEach((portalId, index) => {
        const portal = world.getEntity(portalId);
        if (portal) {
          removePortal(portal, false);
          removedIds.push(portalId);
        }
        // If unloaded (not destroyed), leave it in the gun's portalList -
        // it'll be caught by a future removal action once it's loaded again.
      });
    } else {
      const idx = childList.indexOf(portalEntity.id);
      if (idx !== -1) {
        childList.splice(idx, 1);
        linkPortals(childList[0], childList[childList.length - 1]);
        rootPortal.setDynamicProperty(
          portalDP.childList,
          JSON.stringify(childList),
        );
        removedIds.push(portalEntity.id);
        removePortal(portalEntity, false);
      }
    }
  } else {
    removedIds.push(portalEntity.id, dualPortal.id);
    removePortal(portalEntity, true);
  }

  finishRemoval();
});

world.afterEvents.entityItemDrop.subscribe((event) => {
  tr.entityItemDrop(event);
});

world.afterEvents.entityHitBlock.subscribe((event) => {
  tr.entityHitBlock(event);
});

world.afterEvents.playerButtonInput.subscribe(
  (event) => {
    tr.playerJumpInput(event);
  },
  { buttons: [InputButton.Jump], state: ButtonState.Pressed },
);

world.afterEvents.playerSwingStart.subscribe(
  (event) => {
    tr.playerSwingStart(event);
  },
  { swingSource: EntitySwingSource.Attack, heldItemOption: HeldItemOption.AnyItem },
);

world.afterEvents.entityDie.subscribe((event) => {
  onBlenderVictimDie(event.deadEntity);
});

world.afterEvents.playerSpawn.subscribe((event) => {
  releaseBlenderLock(event.player);
  if (hasShockStun(event.player)) releaseShockStun(event.player);
});

system.run(() => {
  for (const player of world.getAllPlayers()) {
    releaseBlenderLock(player);
    if (hasShockStun(player)) releaseShockStun(player);
  }
});