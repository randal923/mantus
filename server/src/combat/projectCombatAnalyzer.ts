import type { CombatAnalyzerState } from "@tibia/protocol";
import type { PartyHooks } from "../party/PartyHooks";
import type { Player } from "../Player";
import type { World } from "../World";

/**
 * Builds the analyzer panel for one player. The row set is exactly the
 * player's own party (or just the player when unpartied), so the panel never
 * becomes a channel for information about creatures or players the session
 * cannot already see — party membership and member names are public to the
 * party itself.
 */
export function projectCombatAnalyzer(
  world: World,
  player: Player,
  now: number,
  partyHooks?: PartyHooks,
): CombatAnalyzerState {
  const memberIds = partyHooks?.getPartyMemberIds(player.id) ?? [player.id];
  const entries = memberIds.flatMap((memberId) => {
    const member =
      memberId === player.id ? player : world.getPlayer(memberId);
    if (!member) return [];
    return [
      {
        playerId: member.id,
        name: member.name,
        damageDealt: member.analyzer.damageDealt,
        damageTaken: member.analyzer.damageTaken,
        healingDone: member.analyzer.healingDone,
      },
    ];
  });
  return { elapsedMs: player.analyzer.elapsedMs(now), entries };
}
