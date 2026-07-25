import type {
  PartyAnalyzerEntry,
  PartyAnalyzerMessage,
  PartyAnalyzerPriceMode,
} from "@tibia/protocol";
import type { ItemValuation } from "./ItemValuation";
import type { Player } from "../Player";

/**
 * Projects one party's hunt-session totals. The row set is exactly the online
 * members handed in by the caller, so the panel can never widen beyond the
 * party the recipient belongs to (charter rule 6). Every number is
 * server-computed; nothing here reads a client-reported value.
 */
export function projectPartyAnalyzer(input: {
  readonly members: ReadonlyArray<Player>;
  readonly valuation: ItemValuation;
  readonly priceMode: PartyAnalyzerPriceMode;
  readonly now: number;
}): PartyAnalyzerMessage {
  const entries: PartyAnalyzerEntry[] = input.members.map((member) => {
    const lootValue = input.valuation.totalValue(
      member.partyAnalyzer.loot(),
      input.priceMode,
    );
    const supplyValue = input.valuation.totalValue(
      member.partyAnalyzer.supplies(),
      input.priceMode,
    );
    return {
      playerId: member.id,
      name: member.name,
      damageDealt: member.analyzer.damageDealt,
      damageTaken: member.analyzer.damageTaken,
      healingDone: member.analyzer.healingDone,
      lootValue,
      supplyValue,
      balance: lootValue - supplyValue,
    };
  });
  // The leader's own clock is the session clock: it is the one reset resets.
  const elapsedMs = input.members[0]?.partyAnalyzer.elapsedMs(input.now) ?? 0;
  return {
    type: "party-analyzer",
    elapsedMs,
    priceMode: input.priceMode,
    entries,
  };
}
