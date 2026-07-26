import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Podium use opens the owner-scoped edit window (Canary sendPodiumWindow /
 * sendMonsterPodiumWindow). Fails closed when no podium service is wired.
 */
export function handlePodiumUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "podium" }>,
): void {
  if (!context.openPodium) {
    context.session.sendError("item-action-failed");
    return;
  }
  context.openPodium(action.item);
}
