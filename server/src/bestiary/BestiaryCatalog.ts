import type { BestiaryClass, BossCategory } from "@tibia/protocol";
import type { MonsterType } from "../creature/MonsterType";

export interface BestiaryCatalogEntry {
  readonly raceId: number;
  readonly className: BestiaryClass;
  readonly stars: number;
  readonly occurrence: number;
  readonly charmPoints: number;
  readonly firstUnlock: number;
  readonly secondUnlock: number;
  readonly toKill: number;
  readonly locations: string;
  /** Primary monster type for name/outfit/stats/loot display. */
  readonly monsterType: MonsterType;
}

export interface BossCatalogEntry {
  readonly raceId: number;
  readonly category: BossCategory;
  readonly monsterType: MonsterType;
}

export interface BestiaryCatalog {
  readonly entriesByRaceId: ReadonlyMap<number, BestiaryCatalogEntry>;
  readonly bossesByRaceId: ReadonlyMap<number, BossCatalogEntry>;
  /** Kill-credit lookup; variants (e.g. butterfly colors) share one race id. */
  readonly raceIdByMonsterTypeId: ReadonlyMap<string, number>;
}
