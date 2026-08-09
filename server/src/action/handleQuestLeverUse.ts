import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Fires a position-keyed quest lever trigger (lever pull or the katana
 * door's forced close). The registry has already re-checked reach and
 * visibility; the quest-lever service re-reads the lever state and every
 * operation target from live tile state. Fails closed when no service is
 * wired.
 */
export function handleQuestLeverUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "quest-lever" }>,
): void {
  if (!context.questLeverUse) {
    context.session.sendError("item-action-failed");
    return;
  }
  context.questLeverUse(action.trigger);
}
