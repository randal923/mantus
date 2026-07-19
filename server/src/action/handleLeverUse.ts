import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/** Flips a bare lever between its on/off types; effects stay quest-gated. */
export function handleLeverUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "lever" }>,
): void {
  context.applyPlan(
    planTransformMapItem({
      characterId: context.player.id,
      catalog: context.catalog,
      world: context.world,
      instanceId: action.item.instanceId,
      position: context.position,
      toTypeId: action.toTypeId,
    }),
  );
}
