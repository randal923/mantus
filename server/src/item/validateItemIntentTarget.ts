import type { Position } from "@tibia/protocol";
import type { World } from "../World";
import type { InventoryCache } from "./InventoryCache";
import { isNear } from "./isNear";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemIntent } from "./ItemIntent";

/** Furthest tile a map item may be thrown to, in tiles from the player. */
const THROW_RANGE = 7;

/**
 * Validates the intent's target (destination container/slot, text length,
 * proximity, map visibility, throw range) at execution time. Returns false
 * when the intent must be rejected with "item-action-failed".
 */
export function validateItemIntentTarget(
  intent: ItemIntent,
  item: Item | undefined,
  playerPosition: Position,
  cache: InventoryCache,
  catalog: ItemCatalog,
  world: World,
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
  if (
    (intent.type === "pickup-item" || intent.type === "unequip-item") &&
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
    (intent.type === "drop-item" || intent.type === "use-item-with") &&
    (!isNear(playerPosition, intent.type === "drop-item" ? intent.position : intent.targetPosition) ||
      !world.getTile(
        intent.type === "drop-item" ? intent.position : intent.targetPosition,
      ))
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
  }
  if (intent.type === "move-map-item") {
    const visible = world
      .getMapItems(intent.fromPosition)
      .find((candidate) => candidate.instanceId === intent.itemId);
    if (
      !isNear(playerPosition, intent.fromPosition) ||
      !visible ||
      (visible.revision ?? 1) !== intent.revision ||
      intent.toPosition.z !== playerPosition.z ||
      Math.max(
        Math.abs(intent.toPosition.x - playerPosition.x),
        Math.abs(intent.toPosition.y - playerPosition.y),
      ) > THROW_RANGE ||
      !world.getTile(intent.toPosition)
    ) {
      return false;
    }
  }
  return true;
}
