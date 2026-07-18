import type { World } from "../World";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemIntent } from "./ItemIntent";
import type { ItemMutation } from "./ItemMutation";
import type { ItemStore } from "./ItemStore";

/** Maps a validated intent to its store operation; null rejects the intent. */
export function operationForItemIntent(
  store: ItemStore,
  catalog: ItemCatalog,
  world: World,
  characterId: string,
  intent: ItemIntent,
  item: Item | undefined,
): Promise<ItemMutation> | null {
  switch (intent.type) {
    case "equip-item":
      return store.equip(
        characterId,
        intent.itemId,
        intent.revision,
        intent.slot,
      );
    case "unequip-item":
      return store.unequip(
        characterId,
        intent.itemId,
        intent.revision,
        intent.slot,
        intent.destination,
      );
    case "pickup-item":
      return store.pickup(
        characterId,
        intent.itemId,
        intent.revision,
        intent.position,
        world
          .getMapItems(intent.position)
          .find((candidate) => candidate.instanceId === intent.itemId)?.source,
        intent.destination,
      );
    case "drop-item":
      return store.drop(
        characterId,
        intent.itemId,
        intent.revision,
        intent.position,
        intent.count,
      );
    case "move-map-item":
      return store.moveWorldItem(
        characterId,
        intent.itemId,
        intent.revision,
        intent.fromPosition,
        intent.toPosition,
        world
          .getMapItems(intent.fromPosition)
          .find((candidate) => candidate.instanceId === intent.itemId)
          ?.source,
      );
    case "split-stack":
      return store.split(
        characterId,
        intent.itemId,
        intent.revision,
        intent.count,
      );
    case "rotate-item":
      return store.rotate(characterId, intent.itemId, intent.revision);
    case "move-item":
      return store.moveToContainer(
        characterId,
        intent.itemId,
        intent.revision,
        intent.destinationContainerId,
        intent.destinationRevision,
        intent.destinationSlot,
        intent.count,
      );
    case "write-item":
      return store.writeText(
        characterId,
        intent.itemId,
        intent.revision,
        intent.text,
      );
    case "use-item":
    case "use-item-with":
      if (!item || !catalog.require(item.typeId).rotateTo) return null;
      return store.rotate(characterId, intent.itemId, intent.revision);
    case "open-container":
    case "close-container":
      return null;
  }
}
