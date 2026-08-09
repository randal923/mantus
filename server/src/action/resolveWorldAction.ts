import type { Position } from "@tibia/protocol";
import { DECORATION_KIT_ITEM_ID } from "../item/decorationKitItemId";
import { HARVEST_DEFINITIONS } from "./harvestDefinitions";
import type { ItemCatalog } from "../item/ItemCatalog";
import { positionKey } from "../positionKey";
import type { ChestDefinition } from "./ChestDefinition";
import { MAP_CLOCK_ITEM_IDS } from "./clockItemIds";
import { LEVER_TOGGLE_PAIRS } from "./leverTogglePairs";
import { DAILY_SHRINE_ITEM_IDS } from "../daily/dailyShrineItemIds";
import { IMBUEMENT_SHRINE_ITEM_IDS } from "../imbuement/imbuementShrineItemIds";
import { PODIUM_DEFINITIONS } from "../podium/PodiumDefinition";
import { mapItemAttributes } from "./mapItemAttributes";
import type { QuestTouchDefinition } from "./questTouchTables";
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
  questTouches: ReadonlyMap<string, QuestTouchDefinition> = new Map(),
): WorldAction | null {
  // Use-with actions (rope spots, rope holes) never resolve from a bare
  // use-map: they require the authoritative tool check in ToolUseHandler.
  if (world.getMapAction(position, "use")) {
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
  // Quest touches live on baked static scenery (Canary registers them by
  // aid on ids the item catalog may not even carry), so they resolve purely
  // from the position table — never from a placed item.
  const touch = questTouches.get(positionKey(position));
  if (touch) return { kind: "quest-touch", touch };
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
    const harvest = HARVEST_DEFINITIONS.get(item.itemId);
    if (harvest) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "harvest", item, harvest };
    }
    const leverTarget = LEVER_TOGGLE_PAIRS.get(item.itemId);
    if (leverTarget !== undefined) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "lever", item, toTypeId: leverTarget };
    }
    const podium = PODIUM_DEFINITIONS.get(item.itemId);
    if (podium) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "podium", item, podium };
    }
    if (DAILY_SHRINE_ITEM_IDS.has(item.itemId)) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "daily-shrine", item };
    }
    if (IMBUEMENT_SHRINE_ITEM_IDS.has(item.itemId)) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "imbuement-shrine", item };
    }
    if (item.itemId === DECORATION_KIT_ITEM_ID) {
      if (scripted) return { kind: "unsupported" };
      const toTypeId = attributes.unwrapTo;
      // A kit without a furniture target (hand-spawned, legacy) does nothing.
      if (!Number.isInteger(toTypeId) || !catalog.get(toTypeId as number)) {
        return { kind: "unsupported" };
      }
      return { kind: "decoration-kit", item, toTypeId: toTypeId as number };
    }
    // Canary registers foods.lua by item id, so food outranks the generic
    // readable/rotate behaviours the same type could otherwise resolve to.
    if (type.food) {
      if (scripted) return { kind: "unsupported" };
      return { kind: "food", item, food: type.food };
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
