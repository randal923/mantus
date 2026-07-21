import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import { positionKey } from "../positionKey";
import { mapItemAttributes } from "./mapItemAttributes";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/** Canary key_door.lua treats these closed-door action ids as still locked. */
const LOCKED_ACTION_IDS = new Set([101, 1_001]);

/**
 * Canary door state machine: locked refuses, closed opens (per variant
 * rules), open closes unless a creature occupies the doorway. Quest doors
 * are storage-gated and fail closed until 20a-quest-state.
 */
export function handleDoorUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "door" }>,
): void {
  const { session, world, position } = context;
  const { door, item } = action;
  const transformTo = (toTypeId: number) =>
    context.applyPlan(
      planTransformMapItem({
        characterId: context.player.id,
        catalog: context.catalog,
        world,
        instanceId: item.instanceId,
        position,
        toTypeId,
      }),
    );
  // House doors stand on house tiles: only invited characters may operate
  // them, checked against current owner/access state at execution time.
  if (
    context.world.getHouseId?.(position) !== undefined &&
    !context.houseAccess(context.player.id, position)
  ) {
    session.send({
      type: "combat-log",
      kind: "condition",
      text: "Only invited guests may enter this house.",
    });
    return;
  }
  if (door.role === "locked") {
    session.send({ type: "combat-log", kind: "condition", text: "It is locked." });
    return;
  }
  if (door.role === "open") {
    if (world.isOccupied(position)) {
      session.sendError("item-action-failed");
      return;
    }
    transformTo(door.closedId);
    return;
  }
  switch (door.variant) {
    case "custom":
      transformTo(door.openId);
      return;
    case "key": {
      const actionId = mapItemAttributes(world, item).actionId;
      if (typeof actionId === "number" && LOCKED_ACTION_IDS.has(actionId)) {
        session.send({
          type: "combat-log",
          kind: "condition",
          text: "It is locked.",
        });
        return;
      }
      transformTo(door.openId);
      return;
    }
    case "level": {
      // Canary's startup table overwrites OTBM action ids at listed positions;
      // every other level door keeps its embedded `1000 + level` action id.
      const actionId = mapItemAttributes(world, item).actionId;
      const embeddedLevel =
        typeof actionId === "number" &&
        Number.isInteger(actionId) &&
        actionId > 1_000 &&
        actionId <= 3_000
          ? actionId - 1_000
          : undefined;
      const requiredLevel =
        context.doorLevels.get(positionKey(position)) ?? embeddedLevel;
      if (
        requiredLevel === undefined ||
        context.player.level < requiredLevel
      ) {
        session.send({
          type: "combat-log",
          kind: "condition",
          text: "Only the worthy may pass.",
        });
        return;
      }
      transformTo(door.openId);
      return;
    }
    case "quest":
      // Storage-gated content ships with 20a-quest-state; until then the
      // door presents Tibia's sealed message instead of a generic failure.
      session.send({
        type: "combat-log",
        kind: "condition",
        text: "The door seems to be sealed against unwanted intruders.",
      });
      return;
  }
}
