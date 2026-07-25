import { planWriteMapItem } from "../item/plan/planWriteMapItem";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Canary's blackboard/tombstone write path. The type's writeability and its own
 * `maxLength`, the claimed revision, and the tile's current contents are all
 * re-checked inside the plan at execution time, so two concurrent writers
 * leave exactly one coherent text on one row (charter rules 1, 2, 4).
 */
export function handleMapWrite(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "write" }>,
): void {
  context.applyPlan(
    planWriteMapItem({
      characterId: context.player.id,
      catalog: context.catalog,
      world: context.world,
      instanceId: action.item.instanceId,
      position: context.position,
      text: action.text,
      expectedVersion: action.expectedVersion,
    }),
  );
}
