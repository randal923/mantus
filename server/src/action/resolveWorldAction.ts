import type { Position } from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import { positionKey } from "../positionKey";
import type { ChestDefinition } from "./ChestDefinition";
import { MAP_CLOCK_ITEM_IDS } from "./clockItemIds";
import { LEVER_TOGGLE_PAIRS } from "./leverTogglePairs";
import { mapItemAttributes } from "./mapItemAttributes";
import type { WorldAction } from "./WorldAction";
import type { WorldActionWorldView } from "./WorldActionWorldView";

/**
 * Resolves a use-map position to its typed world action from current tile
 * state (charter rule 4: at execution, not enqueue). Scripted placements
 * (action/unique ids) and door types without pair data resolve to
 * "unsupported" so they fail closed; null means nothing actionable here and
 * the caller falls through to the movement correction path.
 */
export function resolveWorldAction(
  world: WorldActionWorldView,
  catalog: ItemCatalog,
  position: Position,
  chests: ReadonlyMap<string, ChestDefinition> = new Map(),
): WorldAction | null {
  // Use-with actions (rope spots) never resolve from a bare use-map: they
  // require the authoritative tool check in ToolUseHandler.
  if (world.getMapAction(position)?.activation === "use") {
    return { kind: "map-movement" };
  }
  const items = [...world.getMapItems(position)].sort(
    (left, right) => right.stackIndex - left.stackIndex,
  );
  // A chest's unique-id registration outranks every generic behaviour of the
  // same item type in Canary — container open, rotation, reading.
  const chest = chests.get(positionKey(position));
  if (chest) {
    const placed = items.find((item) => item.itemId === chest.itemTypeId);
    if (placed) return { kind: "chest", item: placed, chest };
  }
  for (const item of items) {
    const type = catalog.get(item.itemId);
    if (!type) continue;
    const attributes = mapItemAttributes(world, item);
    const scripted =
      attributes.actionId !== undefined || attributes.uniqueId !== undefined;
    if (type.door) {
      if (attributes.uniqueId !== undefined) return { kind: "unsupported" };
      return { kind: "door", item, type, door: type.door };
    }
    // Canary registers the clock action by item id, which outranks the
    // generic rotate behaviour those same pendulum clocks would otherwise get.
    if (MAP_CLOCK_ITEM_IDS.has(item.itemId)) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "clock", item };
    }
    const leverTarget = LEVER_TOGGLE_PAIRS.get(item.itemId);
    if (leverTarget !== undefined) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "lever", item, toTypeId: leverTarget };
    }
    if (type.text?.readable) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "read", item, type };
    }
    if (type.rotateTo) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "rotate", item, toTypeId: type.rotateTo };
    }
    // Door-kind types without imported pair data (house doors, quest-only
    // sets) and any other scripted placement fail closed.
    if (scripted || type.kind === "door") return { kind: "unsupported" };
  }
  return null;
}
