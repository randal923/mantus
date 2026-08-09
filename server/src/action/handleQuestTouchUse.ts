import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Fires a position-keyed quest touch on baked scenery. The registry has
 * already re-checked reach and visibility; the quest-touch service owns the
 * world-shared cooldown, the removal, and the tick-driven restore. Fails
 * closed when no service is wired.
 */
export function handleQuestTouchUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "quest-touch" }>,
): void {
  if (!context.questTouchUse) {
    context.session.sendError("item-action-failed");
    return;
  }
  context.questTouchUse(action.touch);
}
