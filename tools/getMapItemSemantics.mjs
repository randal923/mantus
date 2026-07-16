const MUTABLE_TYPES = new Set([
  "bed",
  "container",
  "depot",
  "door",
  "magicfield",
  "mailbox",
  "rewardchest",
  "trashholder",
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

export function getMapItemSemantics(appearance, staticItem = {}, attributes = {}) {
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
  const mutable =
    cataloged &&
    (movable ||
      pickupable ||
      stateful ||
      MUTABLE_TYPES.has(staticItem.type) ||
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
