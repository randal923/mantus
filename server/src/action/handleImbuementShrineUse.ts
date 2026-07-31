import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Using an imbuement shrine opens the window with no item picked, matching
 * Canary's ImbuementAction::Open. Fails closed when no imbuement service is
 * wired.
 */
export function handleImbuementShrineUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "imbuement-shrine" }>,
): void {
  void action;
  if (!context.openImbuementWindow) {
    context.session.sendError("item-action-failed");
    return;
  }
  context.openImbuementWindow();
}
