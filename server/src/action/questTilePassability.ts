import { positionKey } from "../positionKey";
import { QUEST_LEVER_DEFINITIONS } from "./questLeverTables";
import { QUEST_TOUCH_ACTIONS } from "./questTouchTables";

/**
 * How quest-owned items on a tile decide its passability. The static
 * navigation bitset baked the map's placed state, so `DynamicMapItems`
 * overlays the live answer whenever the tile's quest items change.
 */
export interface QuestTilePassabilityRule {
  /** The tile blocks while any of these items is present (walls, stones, rails). */
  readonly blockingItemIds?: ReadonlyArray<number>;
  /** The tile is walkable only while this item is present (a bridge span). */
  readonly requiredItemId?: number;
  /**
   * Whether the blocked state also blocks projectiles: true for solid walls
   * and stones, false for a water channel a shot can pass over.
   */
  readonly blocksProjectileWhenBlocked: boolean;
  /**
   * Ground speed while the tile is walkable, for spans whose baked ground
   * has none (Canary transforms the water ground into the drawbridge; we
   * overlay the drawbridge item's own appearance speed instead).
   */
  readonly groundSpeedWhenWalkable?: number;
}

const rules = new Map<string, QuestTilePassabilityRule>();

// Quest-touch removable walls: blocking scenery whose absence opens the way.
for (const touch of QUEST_TOUCH_ACTIONS.values()) {
  for (const removal of touch.removals) {
    rules.set(positionKey(removal.position), {
      blockingItemIds: [removal.itemId],
      blocksProjectileWhenBlocked: true,
    });
  }
}

// Quest-lever tiles, keyed off the lever tables so a new lever cannot ship
// without its passability being declared here.
const LEVER_TILE_RULES: ReadonlyArray<
  readonly [{ x: number; y: number; z: number }, QuestTilePassabilityRule]
> = [
  // Bear room stone: solid rock while placed.
  [
    { x: 32_145, y: 32_101, z: 11 },
    { blockingItemIds: [1_791], blocksProjectileWhenBlocked: true },
  ],
  // Sewer bridge span: the west/east tiles also carry a shallow-water rail
  // while retracted; the water channel never blocks projectiles. Ground
  // speed 90 is the drawbridge appearance's own (objects.json id 5770) —
  // the middle tile's baked water ground has none at all.
  [
    { x: 32_099, y: 32_205, z: 8 },
    {
      blockingItemIds: [4_634],
      requiredItemId: 5_770,
      blocksProjectileWhenBlocked: false,
      groundSpeedWhenWalkable: 90,
    },
  ],
  [
    { x: 32_100, y: 32_205, z: 8 },
    {
      requiredItemId: 5_770,
      blocksProjectileWhenBlocked: false,
      groundSpeedWhenWalkable: 90,
    },
  ],
  [
    { x: 32_101, y: 32_205, z: 8 },
    {
      blockingItemIds: [4_636],
      requiredItemId: 5_770,
      blocksProjectileWhenBlocked: false,
      groundSpeedWhenWalkable: 90,
    },
  ],
];
for (const [position, rule] of LEVER_TILE_RULES) {
  rules.set(positionKey(position), rule);
}

// Guard against a lever definition touching a tile nobody declared: every
// create/remove target that is not a lever or a door must have a rule or be
// deliberately passability-neutral. (Transforms are door pairs, which own
// their tiles through the door overlay already.)
const NEUTRAL_ITEM_IDS = new Set<number>();
for (const definition of QUEST_LEVER_DEFINITIONS) {
  for (const branch of [definition.pull, definition.reset]) {
    for (const operation of branch.operations) {
      if (operation.kind === "transform") continue;
      const rule = rules.get(positionKey(operation.position));
      if (rule) continue;
      if (!NEUTRAL_ITEM_IDS.has(operation.itemId)) {
        throw new Error(
          `quest lever ${definition.id} mutates ${operation.itemId} at ` +
            `${positionKey(operation.position)} without a passability rule`,
        );
      }
    }
  }
}

/**
 * Tiles whose passability is owned by quest-touch or quest-lever items,
 * keyed by `positionKey`. Consumed by `DynamicMapItems.refreshTileOverride`
 * the same way door tiles are.
 */
export const QUEST_TILE_PASSABILITY: ReadonlyMap<
  string,
  QuestTilePassabilityRule
> = rules;
