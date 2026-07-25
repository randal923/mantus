import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Grants a placed quest chest's reward. The registry has already re-checked
 * visibility and adjacency; the chest service owns the RNG, the durable
 * per-character looted gate, and the atomic grant.
 */
export function handleChestUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "chest" }>,
): void {
  if (!context.lootChest) {
    context.session.sendError("item-action-failed");
    return;
  }
  context.lootChest(action.chest);
}
