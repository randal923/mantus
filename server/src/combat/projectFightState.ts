import type { FightState } from "@tibia/protocol";
import type { Session } from "../Session";
import type { World } from "../World";

export function projectFightState(
  session: Session,
  world: World,
  now: number,
): FightState {
  const player = session.playerId
    ? world.getPlayer(session.playerId)
    : undefined;
  return {
    attackTargetId: session.attackTargetId,
    mode: { ...session.fightMode },
    ...(player && player.skull !== "none"
      ? {
          skull: {
            kind: player.skull,
            remainingMs:
              player.skullExpiresAt === null
                ? null
                : Math.max(0, player.skullExpiresAt - now),
          },
        }
      : {}),
    conditions: player?.conditions.project(now) ?? [],
    cooldowns: [...session.combatCooldowns.entries()]
      .filter(([, cooldown]) => cooldown.readyAt > now)
      .map(([group, cooldown]) => ({
        group,
        readyAt: cooldown.readyAt,
        remainingMs: Math.max(0, cooldown.readyAt - now),
        totalMs: cooldown.totalMs,
      }))
      .sort((left, right) => left.group.localeCompare(right.group)),
  };
}
