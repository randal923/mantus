import { planEatMapItem } from "../item/plan/planEatMapItem";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Eats food lying on the ground, mirroring the carried use-item food path:
 * satiation is checked before the stack is touched, and the feed plus its
 * message follow the same commit.
 */
export function handleFoodEat(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "food" }>,
): void {
  const { session, player, position, now } = context;
  if (!player.canFeed(action.food.durationSeconds, now)) {
    session.sendError("player-full");
    return;
  }
  const plan = planEatMapItem({
    characterId: player.id,
    catalog: context.catalog,
    world: context.world,
    instanceId: action.item.instanceId,
    position,
    expectedVersion: action.item.revision ?? 1,
  });
  if (!plan) {
    session.sendError("item-action-failed");
    return;
  }
  context.applyPlan(plan);
  player.feed(action.food.durationSeconds, now);
  session.send({
    type: "combat-log",
    kind: "condition",
    text: action.food.message,
  });
}
