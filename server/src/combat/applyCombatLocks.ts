import type { Player } from "../Player";
import type { CombatFeedback } from "./CombatFeedback";

const COMBAT_LOCK_MS = 60_000;

export function applyCombatLocks(
  feedback: CombatFeedback,
  player: Player,
  sourceId: string | null,
  pzLocked: boolean,
  now: number,
): void {
  player.conditions.apply(
    {
      type: "combat-lock",
      sourceId,
      durationMs: COMBAT_LOCK_MS,
    },
    now,
  );
  if (pzLocked) {
    player.conditions.apply(
      {
        type: "pz-lock",
        sourceId,
        durationMs: COMBAT_LOCK_MS,
      },
      now,
    );
  }
  feedback.sendFightStateForPlayer(player.id, now);
}
