import type { World } from "../World";
import type { ItemIntent } from "./ItemIntent";
import type { ItemMutation } from "./ItemMutation";
import type { ItemStore } from "./ItemStore";

/**
 * Maps a validated DB-first intent (world interactions) to its store
 * operation; null rejects the intent. Carried-only intents are planned in
 * memory by planCarriedIntent and never reach this mapping.
 */
export function operationForItemIntent(
  store: ItemStore,
  world: World,
  characterId: string,
  intent: ItemIntent,
): Promise<ItemMutation> | null {
  switch (intent.type) {
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
        intent.equipSlot !== undefined,
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
    default:
      return null;
  }
}
