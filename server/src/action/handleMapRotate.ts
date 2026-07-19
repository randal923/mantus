import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/** Rotates map furniture through its catalog rotateTo chain in place. */
export function handleMapRotate(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "rotate" }>,
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
