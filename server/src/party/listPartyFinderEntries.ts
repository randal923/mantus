import {
  PARTY_FINDER_LIMITS,
  type PartyFinderEntry,
  type PartyFinderListingMessage,
} from "@tibia/protocol";
import type { Party } from "./Party";
import type { Player } from "../Player";

/**
 * Builds the finder listing for one searching player. Rows carry only the
 * advert itself — no positions, no health, no roster — and the row count is
 * capped, so a search can neither leak private state nor return an unbounded
 * result (charter rules 6, 10).
 *
 * `finderVisible` is re-evaluated here, at query execution time, so a leader
 * who opts out between advertising and this search is not listed.
 */
export function listPartyFinderEntries(input: {
  readonly parties: Iterable<Party>;
  readonly searcher: Player;
  readonly forOwnLevel: boolean;
  readonly getPlayer: (playerId: string) => Player | undefined;
  readonly finderVisible: (characterId: string) => boolean;
}): PartyFinderListingMessage {
  const entries: PartyFinderEntry[] = [];
  let matched = 0;
  for (const party of input.parties) {
    const advert = party.finderAdvert;
    if (!advert) continue;
    const leader = input.getPlayer(party.leaderId);
    if (!leader) continue;
    if (!input.finderVisible(leader.id)) continue;
    // A searcher already in this party has the full projection instead.
    if (party.isMember(input.searcher.id)) continue;
    if (party.size >= 25) continue;
    if (input.forOwnLevel) {
      const level = input.searcher.level;
      if (advert.minLevel !== undefined && level < advert.minLevel) continue;
      if (advert.maxLevel !== undefined && level > advert.maxLevel) continue;
    }
    matched += 1;
    if (entries.length >= PARTY_FINDER_LIMITS.maxListings) continue;
    entries.push({
      partyId: party.id,
      leaderId: leader.id,
      leaderName: leader.name,
      title: advert.title,
      memberCount: party.size,
      minLevel: advert.minLevel ?? null,
      maxLevel: advert.maxLevel ?? null,
    });
  }
  return {
    type: "party-finder-listing",
    entries,
    truncated: matched > entries.length,
  };
}
