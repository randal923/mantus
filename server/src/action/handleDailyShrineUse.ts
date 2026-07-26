import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

/**
 * Reward shrine use projects the session's own daily-reward state (Canary
 * daily_reward_shrine.lua). Fails closed when no daily service is wired.
 */
export function handleDailyShrineUse(
  context: WorldActionContext,
  action: Extract<WorldAction, { kind: "daily-shrine" }>,
): void {
  void action;
  if (!context.openDailyRewards) {
    context.session.sendError("item-action-failed");
    return;
  }
  context.openDailyRewards();
}
