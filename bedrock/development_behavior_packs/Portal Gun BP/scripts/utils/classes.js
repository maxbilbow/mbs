import { ItemStack, world } from "@minecraft/server";
import { setChargeBar } from "../utils/utils";
import { portalGunDP, HIGH_PRESSURE_SPEED } from "../utils/ids&variables";
import { openPortalGunMenu } from "../gui/pg_menu";

export class PortalGun {
  constructor({
    typeId,
    baseId,
    dischargedVersionId,
    emptyTubeId,
    chargedTubeId,
    projectileId,
    highPressureProjectileId,
    portalId,
    interfaceTextures,
    basic = false,
  }) {
    this.typeId = typeId;
    this.baseId = baseId;
    this.dischargedVersionId = dischargedVersionId;
    this.emptyTubeId = emptyTubeId;
    this.chargedTubeId = chargedTubeId;
    this.projectileId = projectileId;
    this.highPressureProjectileId = highPressureProjectileId;
    this.portalId = portalId;
    this.interfaceTextures = interfaceTextures;
    this.basic = basic;
  }

  openInterface(player, portalGunItem) {
    try {
      openPortalGunMenu(player, portalGunItem, this);
    } catch (error) {
      player.sendMessage({
        translate: "ram_pg.interface.open_failed",
        with: [error],
      });
      player.dimension.playSound("ram_pg:error_sound", player.location);
    }
  }

  fireProjectile(player, portalGunItem) {
    try {
      const headLocation = player.getHeadLocation();
      const viewDirection = player.getViewDirection();
      const spawnPosition = {
        x: headLocation.x,
        y: headLocation.y - 0.1,
        z: headLocation.z,
      };

      const highPressure =
        portalGunItem.getDynamicProperty(portalGunDP.behavior.highPressure) ===
        true;

      const projectileType = highPressure
        ? this.highPressureProjectileId
        : this.projectileId;

      const projectile = player.dimension.spawnEntity(
        projectileType,
        spawnPosition,
      );
      const projectileComponent = projectile.getComponent(
        "minecraft:projectile",
      );

      if (projectileComponent) {
        const speed = highPressure ? HIGH_PRESSURE_SPEED : 1;
        projectileComponent.owner = player;
        projectileComponent.shoot({
          x: viewDirection.x * speed,
          y: viewDirection.y * speed,
          z: viewDirection.z * speed,
        });
      }

      const fireSound =
        this.chargedTubeId === "ram_pg:yellow_portal_fluid"
          ? "ram_pg:fire_portal_yellow"
          : "ram_pg:fire_portal";
      player.dimension.playSound(fireSound, player.location);
      return projectile;
    } catch (error) {
      player.sendMessage({
        translate: "ram_pg.projectile.fire_failed",
        with: [error],
      });
      player.dimension.playSound("ram_pg:error_sound", player.location);
    }
  }

  decreaseCharge(player, portalGunItem, charge, amount) {
    charge = Math.max(0, charge - amount);
    portalGunItem.setDynamicProperty(portalGunDP.charge, charge);
    if (charge === 0) {
      const dischargedId = this.dischargedVersionId;
      const dischargedPortalGun = new ItemStack(dischargedId, 1);
      for (const id of portalGunItem.getDynamicPropertyIds()) {
        dischargedPortalGun.setDynamicProperty(
          id,
          portalGunItem.getDynamicProperty(id),
        );
      }
      player.dimension.playSound(
        "ram_pg:power_off_portal_gun",
        player.location,
      );
      portalGunItem = dischargedPortalGun;
    }
    return portalGunItem;
  }
}
