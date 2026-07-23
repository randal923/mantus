import type { FightState } from "@tibia/protocol";

export function anchorFightStateCooldowns(
  fightState: FightState,
  receivedAt: number,
): FightState {
  return {
    ...fightState,
    cooldowns: fightState.cooldowns.map((cooldown) => ({
      ...cooldown,
      readyAt: receivedAt + cooldown.remainingMs,
    })),
  };
}
