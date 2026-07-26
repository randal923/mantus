import type {
  MountEntitlement,
  OutfitEntitlement,
  PodiumRaceEntry,
} from "@tibia/protocol";

/**
 * Entitlement reads the podium re-checks at execution time. All lists are the
 * session's own unlocks — nothing here may leak another character's state.
 */
export interface PodiumHooks {
  outfits(characterId: string): ReadonlyArray<OutfitEntitlement>;
  mounts(characterId: string): ReadonlyArray<MountEntitlement>;
  /** Bosstiary bosses at boss level 2+ (Canary getBosstiaryFinished(player, 2)). */
  bossRaces(characterId: string): ReadonlyArray<PodiumRaceEntry>;
  /** Fully completed bestiary races (Canary getBestiaryFinished). */
  bestiaryRaces(characterId: string): ReadonlyArray<PodiumRaceEntry>;
}
