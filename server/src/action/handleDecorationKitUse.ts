import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Unwraps a store-bought decoration kit into the furniture it names, in place
 * on the tile it lies on. Canary's rule: only inside a house, and only for
 * someone who may redecorate it — the owner or a subowner, re-checked at
 * execution time, never a mere guest (charter rule 4).
 */
export function handleDecorationKitUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "decoration-kit" }>,
): void {
  if (!context.decorateAccess?.(context.player.id, context.position)) {
    context.session.send({
      type: "combat-log",
      kind: "condition",
      text: "Unwrap it in a house you own.",
    });
    return;
  }
  context.applyPlan(
    planTransformMapItem({
      characterId: context.player.id,
      catalog: context.catalog,
      world: context.world,
      instanceId: action.item.instanceId,
      position: context.position,
      toTypeId: action.toTypeId,
      // The kit's routing attributes end with the kit itself.
      attributes: {},
    }),
  );
}
