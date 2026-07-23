import type { Position, ViewRange } from "@tibia/protocol";
import type { World } from "../World";
import type { InventoryCache } from "./InventoryCache";
import { isNear } from "./isNear";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemIntent } from "./ItemIntent";

/**
 * Validates the intent's target (destination container/slot, text length,
 * proximity, map visibility, and line of sight) at execution time. Returns
 * false when the intent must be rejected with "item-action-failed".
 */
export function validateItemIntentTarget(
  intent: ItemIntent,
  item: Item | undefined,
  playerPosition: Position,
  viewRange: ViewRange,
  cache: InventoryCache,
  catalog: ItemCatalog,
  world: World,
  canUseHouseTile: (position: Position) => boolean = () => true,
): boolean {
  if (intent.type === "move-item") {
    const destination = cache.items.find(
      (candidate) => candidate.id === intent.destinationContainerId,
    );
    if (
      !destination ||
      destination.version !== intent.destinationRevision ||
      catalog.require(destination.typeId).containerCapacity === undefined ||
      intent.destinationSlot >=
        (catalog.require(destination.typeId).containerCapacity ?? 0)
    ) {
      return false;
    }
    const type = catalog.require(item!.typeId);
    if (
      intent.count !== undefined &&
      (!type.stackable || intent.count > item!.count)
    ) {
      return false;
    }
  }
  if (intent.type === "loot-item") {
    const root = world.getWorldItem(intent.containerId);
    if (
      !root ||
      root.location.kind !== "world" ||
      !isNear(playerPosition, root.location.position)
    ) {
      return false;
    }
  }
  if (
    (intent.type === "pickup-item" ||
      intent.type === "unequip-item" ||
      intent.type === "loot-item") &&
    intent.destination
  ) {
    const destination = cache.items.find(
      (candidate) => candidate.id === intent.destination!.containerId,
    );
    if (
      !destination ||
      destination.version !== intent.destination.containerRevision ||
      intent.destination.slot >=
        (catalog.require(destination.typeId).containerCapacity ?? 0)
    ) {
      return false;
    }
  }
  if (intent.type === "write-item") {
    const type = catalog.require(item!.typeId);
    if (
      !type.text?.writeable ||
      intent.text.length > type.text.maxLength
    ) {
      return false;
    }
  }
  if (
    intent.type === "drop-item" &&
    (!world.canSee(playerPosition, intent.position, viewRange) ||
      !world.hasLineOfSight(playerPosition, intent.position) ||
      !world.getTile(intent.position))
  ) {
    return false;
  }
  if (
    intent.type === "use-item-with" &&
    (!isNear(playerPosition, intent.targetPosition) ||
      !world.getTile(intent.targetPosition))
  ) {
    return false;
  }
  // Placing or removing items on house tiles requires guest+ access,
  // re-checked here at execution time against current owner state.
  if (intent.type === "drop-item" && !canUseHouseTile(intent.position)) {
    return false;
  }
  if (intent.type === "pickup-item" && !canUseHouseTile(intent.position)) {
    return false;
  }
  if (
    intent.type === "move-map-item" &&
    (!canUseHouseTile(intent.fromPosition) ||
      !canUseHouseTile(intent.toPosition))
  ) {
    return false;
  }
  if (intent.type === "pickup-item") {
    const visible = world
      .getMapItems(intent.position)
      .find((candidate) => candidate.instanceId === intent.itemId);
    if (
      !isNear(playerPosition, intent.position) ||
      !visible ||
      (visible.revision ?? 1) !== intent.revision
    ) {
      return false;
    }
    if (intent.equipSlot) {
      // Direct pickup-to-equipment: reject a mismatched slot before planning.
      if (intent.destination) return false;
      const type = catalog.get(visible.itemId);
      if (!type || type.equipmentSlot !== intent.equipSlot) return false;
    }
  }
  if (intent.type === "move-map-item") {
    const visible = world
      .getMapItems(intent.fromPosition)
      .find((candidate) => candidate.instanceId === intent.itemId);
    if (
      !isNear(playerPosition, intent.fromPosition) ||
      !visible ||
      (visible.revision ?? 1) !== intent.revision ||
      !world.canSee(playerPosition, intent.toPosition, viewRange) ||
      !world.hasLineOfSight(playerPosition, intent.toPosition) ||
      !world.getTile(intent.toPosition)
    ) {
      return false;
    }
  }
  return true;
}
