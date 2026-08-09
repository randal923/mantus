// "trashholder" is deliberately absent: Canary types water/lava/tar grounds
// as trashholders (throwing an item in destroys it), but the tiles themselves
// are immutable scenery and must stay in the static client map. The converter
// still emits them under their own "trashholder" classification so the server
// knows the tile destroys thrown items without owning a world item there.
// Types the server must own on the tile. "dummy" is here even though the free
// exercise dummies are bolted-down scenery: `loadMapItems` only surfaces
// mutable entries, and the exercise-weapon action has to be able to ask "is
// there a dummy on this tile?" at execution time.
const MUTABLE_TYPES = new Set([
  "bed",
  "container",
  "depot",
  "door",
  "dummy",
  "magicfield",
  "mailbox",
  "rewardchest",
]);

// Ids the server must own so their use-action can reach them at runtime:
// shovel-diggable closed piles (Canary's `holes`; sync with
// SHOVEL_HOLE_PAIRS in server/src/action/shovelHolePairs.ts), bare on/off
// levers (sync with LEVER_TOGGLE_PAIRS in
// server/src/action/leverTogglePairs.ts) and the reward shrines the reward
// wall opens from (sync with DAILY_SHRINE_ITEM_IDS in
// server/src/daily/dailyShrineItemIds.ts). None of these are movable or
// typed in MUTABLE_TYPES, so without this they stay baked draw-only and
// their handler never sees them — the 37 wall shrines the map places in
// the city temples are all 25802/25803.
const MUTABLE_ITEM_IDS = new Set([
  593, 606, 608, 2772, 2773, 9110, 9111, 25_720, 25_721, 25_722, 25_723,
  25_802, 25_803,
  // Harvestable plants (sync with HARVEST_DEFINITIONS in
  // server/src/action/harvestDefinitions.ts and the scythe/sickle tables in
  // server/src/action/harvestTables.ts): immovable scenery that must be
  // server-owned so cutting can transform it and decay can regrow it.
  // Blueberry bush (full/picked):
  3_699, 3_700,
  // Wheat growth stages (sprouting -> growing -> ripe):
  3_651, 3_652, 3_653,
  // Sugar cane stages (harvested 5462 -> 5470 -> 5465; ripe 5463; burning 5464):
  5_462, 5_463, 5_464, 5_465, 5_470,
  // Reed (full/cut):
  30_623, 30_624,
  // Imbuing shrines and crystals (server/src/imbuement/imbuementShrineItemIds
  // .ts), for the same reason as the reward shrines above: immovable,
  // untyped decoration that would stay baked draw-only, so the server would
  // hold no map item for them — the use never resolves and the adjacency
  // check every imbuement mutation runs could never see one.
  24_964, 25_060, 25_061, 25_101, 25_102, 25_103, 25_104, 25_174, 25_175,
  25_182, 25_183, 25_201, 25_202,
]);

// Single map placements the server must own, keyed "x:y:z" with the client
// id expected at that position. MUTABLE_ITEM_IDS is too blunt for these: the
// same type appears baked all over the map, and only this one placement is
// quest-scripted (sync with QUEST_TOUCH_ACTIONS in
// server/src/action/questTouchTables.ts).
export const MUTABLE_POSITIONS = new Map([
  // Cults of Tibia decaying wall: removed for 5 minutes by the torch bearer
  // at (32400,31793,8).
  ["32396:31806:8", 1295],
  // Rookgaard bear room: the blocking stone the lever at (32148,32105,11)
  // removes/recreates (sync with QUEST_LEVER_DEFINITIONS in
  // server/src/action/questLeverTables.ts).
  ["32145:32101:11", 1791],
  // Rookgaard sewer bridge: the shallow-water rails the aid-50239 levers
  // remove while the drawbridge is extended.
  ["32099:32205:8", 4634],
  ["32101:32205:8", 4636],
]);

const STATEFUL_ATTRIBUTES = [
  "charges",
  "count",
  "decayingState",
  "depotId",
  "duration",
  "houseDoorId",
  "runeCharges",
  "sleepStart",
  "sleeperGuid",
  "specialDescription",
  "text",
  "writtenBy",
  "writtenDate",
];

export function getMapItemSemantics(
  appearance,
  staticItem = {},
  attributes = {},
  position = undefined,
) {
  const spriteId = appearance.sprites?.[0];
  const cataloged =
    typeof staticItem.name === "string" &&
    Number.isInteger(spriteId) &&
    spriteId > 0;
  const movable = staticItem.movable ?? !appearance.flags.notMoveable;
  const pickupable = staticItem.pickupable ?? appearance.flags.pickupable;
  const stackOrder = appearance.flags.ground
    ? "ground"
    : appearance.flags.groundBorder
      ? "border"
      : appearance.flags.onBottom
        ? "bottom"
        : appearance.flags.onTop
          ? "top"
          : "common";
  const stateful = STATEFUL_ATTRIBUTES.some(
    (attribute) => attributes[attribute] !== undefined,
  );
  const mutableByPosition =
    position !== undefined &&
    MUTABLE_POSITIONS.get(`${position.x}:${position.y}:${position.z}`) ===
      appearance.clientId;
  const mutable =
    cataloged &&
    (movable ||
      pickupable ||
      stateful ||
      MUTABLE_TYPES.has(staticItem.type) ||
      MUTABLE_ITEM_IDS.has(appearance.clientId) ||
      mutableByPosition ||
      appearance.flags.container);
  const interactive =
    mutable ||
    staticItem.type === "ladder" ||
    staticItem.type === "teleport" ||
    attributes.actionId !== undefined ||
    attributes.uniqueId !== undefined ||
    attributes.teleportDestination !== undefined;

  return {
    ground: appearance.flags.ground,
    groundSpeed: appearance.flags.groundSpeed,
    elevation: appearance.flags.elevation,
    stackOrder,
    floorChange: staticItem.floorChange,
    hangable: appearance.flags.hangable,
    container:
      appearance.flags.container || staticItem.type === "container",
    door: staticItem.type === "door",
    field: staticItem.type === "magicfield",
    blocksSolid: appearance.flags.notWalkable || staticItem.blocking === true,
    blocksProjectile:
      appearance.flags.blockProjectile || staticItem.blocksProjectile === true,
    blocksPath: appearance.flags.notPathable,
    limitsFloorView:
      !appearance.flags.dontHide &&
      (appearance.flags.ground || appearance.flags.onBottom),
    movable,
    pickupable,
    mutable,
    interactive,
  };
}
