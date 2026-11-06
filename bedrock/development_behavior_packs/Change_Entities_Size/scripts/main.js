// scripts/entities/player.ts
import { world as world2, system } from "@minecraft/server";

// scripts/utilities/specific_minecraft_functions.ts
import { EntityScaleComponent as EntityScaleComponent2 } from "@minecraft/server";

// scripts/server_forms/server_forms.ts
import { EntityScaleComponent } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
var ChangeEntitySize = class {
  /**
   * Construit le server form UI pour changer la taille de l'entité
   * @param {Entity} entityInteracted L'entité ciblée
   * @returns 
   */
  static buildServerForm(entityInteracted) {
    const changeEntitySize = new ModalFormData().title({ translate: "douarmc_change_entities_size.script.server_form.title" });
    const entityInteractedScaleComponent = entityInteracted.getComponent(EntityScaleComponent.componentId);
    changeEntitySize.textField(
      { translate: "douarmc_change_entities_size.script.server_form.text_field.entity_size_value.label", with: [entityInteracted.typeId] },
      { translate: "douarmc_change_entities_size.script.server_form.text_field.entity_size_value.place_holder_text" },
      entityInteractedScaleComponent.value.toFixed(1)
    );
    return changeEntitySize;
  }
};

// scripts/utilities/specific_minecraft_functions.ts
async function changeSizeByFormUI(source, entityInteracted) {
  const entityInteractedScaleComponent = entityInteracted.getComponent(EntityScaleComponent2.componentId);
  const changeEntitySizeFormUI = ChangeEntitySize.buildServerForm(entityInteracted);
  const resultChangeEntitySizeFormUI = await changeEntitySizeFormUI.show(source);
  if (resultChangeEntitySizeFormUI.canceled)
    return;
  const valueChoosen = Number(resultChangeEntitySizeFormUI.formValues[0]);
  if (isNaN(valueChoosen)) {
    source.sendMessage({ translate: "douarmc_change_entities_size.script.chat.error_message.value_is_not_a_number" });
    return;
  }
  ;
  if (!(valueChoosen >= 0.1 && valueChoosen <= 10)) {
    source.sendMessage({ translate: "douarmc_change_entities_size.script.chat.error_message.value_not_between_valid_numbers" });
    return;
  }
  ;
  entityInteractedScaleComponent.value = valueChoosen;
}
function adaptCameraToPlayerSize(player) {
  const playerScaleComponent = player.getComponent(EntityScaleComponent2.componentId);
  if (playerScaleComponent.value === 1) {
    player.camera.clear();
    return;
  }
  ;
  if (playerScaleComponent.value < 1) {
    player.runCommand(`camera @s set douarmc_change_entities_size:adapt_to_entity_size view_offset 0 ${playerScaleComponent.value * 1.8} entity_offset 0 0 ${-playerScaleComponent.value * -0.6}`);
  } else {
    player.runCommand(`camera @s set douarmc_change_entities_size:adapt_to_entity_size view_offset 0 ${playerScaleComponent.value * 1.8} entity_offset 0 0 ${playerScaleComponent.value * -0.6}`);
  }
}

// scripts/entities/player.ts
system.runInterval(() => {
  const players = world2.getAllPlayers();
  for (const player of players) {
    adaptCameraToPlayerSize(player);
  }
  ;
});

// scripts/items/size_changer.ts
import { world as world3, EntityScaleComponent as EntityScaleComponent4, system as system2 } from "@minecraft/server";
world3.beforeEvents.playerInteractWithEntity.subscribe((eventData) => {
  const { itemStack: sizeChanger, player, target } = eventData;
  if (sizeChanger === void 0)
    return;
  if (sizeChanger.typeId !== "douarmc_change_entities_size:size_changer")
    return;
  if (player.isSneaking === true)
    return;
  if (target.hasComponent(EntityScaleComponent4.componentId) === false) {
    player.sendMessage({ translate: "douarmc_change_entities_size.script.chat.error_message.cannot_change_entity_size" });
    return;
  }
  ;
  eventData.cancel = true;
  system2.run(() => {
    changeSizeByFormUI(player, target);
    if (target.typeId === "minecraft:player") {
      adaptCameraToPlayerSize(target);
    }
    ;
  });
});

// scripts/custom_components_registry.ts
import { world as world5 } from "@minecraft/server";

// scripts/items/custom_components/custom_components.ts
import { system as system3 } from "@minecraft/server";
var ItemSizeChangerComponent = class {
  // Quand l'item est utilisé, on change la taille de l'entité ciblée
  onUse(arg) {
    const { source } = arg;
    if (source.isSneaking === false)
      return;
    system3.run(() => {
      changeSizeByFormUI(source, source);
      adaptCameraToPlayerSize(source);
    });
  }
};

// scripts/custom_components_registry.ts
world5.beforeEvents.worldInitialize.subscribe((eventData) => {
  eventData.itemComponentRegistry.registerCustomComponent("douarmc_change_entities_size:size_changer", new ItemSizeChangerComponent());
});

//# sourceMappingURL=../debug/main.js.map
