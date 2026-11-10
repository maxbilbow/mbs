import * as mc from "@minecraft/server";
import { portalGunDP, ID } from "../utils/ids&variables";

const SOLUTION_TUBE_MAP = {
  interspatial_solution: {
    tube: "ram_pg:blue_portal_fluid",
    fluid: "§9Interspatial§r",
  },
  interdimensional_solution: {
    tube: "ram_pg:green_portal_fluid",
    fluid: "§aInterdimensional§r",
  },
  extradimensional_solution: {
    tube: "ram_pg:yellow_portal_fluid",
    fluid: "§eExtradimensional§r",
  },
};

export function handleSolutionBlock(player, itemStack, block) {
  if (!itemStack) return;

  const isCharged = ID.components.chargedTubes.includes(itemStack.typeId);
  const isEmpty = itemStack.typeId === "ram_pg:empty_tube";
  if (!isCharged && !isEmpty) return;

  if (isCharged) {
    const charge = itemStack.getDynamicProperty(portalGunDP.charge) ?? 100;
    if (charge > 20) {
      player.sendMessage(
        {translate: "ram_pg.fluid_handle.tube_too_charged"},
      );
      return;
    }

    const match = Object.entries(SOLUTION_TUBE_MAP).find(([key]) =>
      block.typeId.includes(key),
    );
    if (match) {
      const [, { tube, fluid }] = match;
      if (itemStack.typeId !== tube) {
        player.sendMessage(
          {translate: "ram_pg.fluid_handle.incompatible_tube", with: [fluid]},
        );
        return;
      }
    }
  }

  decreaseFluidLevel(player, block, itemStack.typeId);
}

export function decreaseFluidLevel(player, block, expectedTypeId) {
  const inventory = player.getComponent("minecraft:inventory").container;
  if (expectedTypeId !== undefined) {
    const selectedItem = inventory.getItem(player.selectedSlotIndex);
    if (!selectedItem || selectedItem.typeId !== expectedTypeId) return;
  }

  let newTypeId;
  let chargedTube;
  let charge = 100;

  if (block.typeId.includes("full")) {
    newTypeId = block.typeId.replace("full", "mid");
  } else if (block.typeId.includes("mid")) {
    newTypeId = block.typeId.replace("mid", "low");
  } else if (block.typeId.includes("low")) {
    newTypeId = "ram_pg:beaker";
  }

  if (block.typeId.includes("interspatial_solution")) {
    chargedTube = new mc.ItemStack("ram_pg:blue_portal_fluid");
  } else if (block.typeId.includes("interdimensional_solution")) {
    chargedTube = new mc.ItemStack("ram_pg:green_portal_fluid");
  } else if (block.typeId.includes("extradimensional_solution")) {
    chargedTube = new mc.ItemStack("ram_pg:yellow_portal_fluid");
  }

  if (newTypeId) {
    const direction = block.permutation.getState(
      "minecraft:cardinal_direction",
    );
    const newPermutation = mc.BlockPermutation.resolve(newTypeId, {
      "minecraft:cardinal_direction": direction,
    });

    block.setPermutation(newPermutation);
    block.dimension.playSound("random.potion.brewed", block.location, {
      volume: 1.0,
      pitch: 1.0,
    });

    const selectedSlot = player.selectedSlotIndex;
    const emptyTube = inventory.getItem(selectedSlot);

    if (emptyTube.amount > 1) {
      emptyTube.amount -= 1;
      inventory.setItem(selectedSlot, emptyTube);
    } else {
      inventory.setItem(selectedSlot, undefined);
    }

    inventory.addItem(chargedTube);
  }
}
