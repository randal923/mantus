import { positionKey } from "../positionKey";
import { mapItemAttributes } from "./mapItemAttributes";
import type { ToolUseContext } from "./ToolUseContext";

/**
 * Canary key_door.lua's key-on-door branch: the door's ActionId (stamped by
 * the door_key startup table, else baked into the map) must match the key's
 * own ActionId. A matching key opens a locked door outright and re-locks a
 * closed or open one; a mismatched key on a locked door says so. Returns
 * false when the target is not an ActionId-bearing door, so the caller
 * reports the generic failure.
 */
export function handleKeyUse(
  context: ToolUseContext,
  keyActionId: number | undefined,
  doorKeys: ReadonlyMap<string, number>,
): boolean {
  for (const item of context.targetItems) {
    const door = context.catalog.get(item.itemId)?.door;
    if (!door) continue;
    const doorActionId =
      doorKeys.get(positionKey(context.target)) ??
      mapItemAttributes(context.world, item).actionId;
    if (typeof doorActionId !== "number" || doorActionId <= 0) return false;
    if (keyActionId !== doorActionId) {
      if (door.role === "locked") {
        context.say("The key does not match.");
        return true;
      }
      return false;
    }
    if (door.role === "locked") {
      return context.transform(item, door.openId);
    }
    // Canary re-locks a matched open or closed door without an occupancy
    // check; lockedId is absent on door sets that cannot lock.
    if (door.lockedId === undefined) return false;
    return context.transform(item, door.lockedId);
  }
  return false;
}
