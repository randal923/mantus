import type { BestiaryCatalog } from "../bestiary/BestiaryCatalog";
import type { BestiaryHooks } from "../bestiary/BestiaryHooks";
import type { Monster } from "../creature/Monster";
import type { SessionRegistry } from "../SessionRegistry";
import type { GemAtelierService } from "./GemAtelierService";
import type { GemTracker } from "./GemTracker";

type GemDropKey = "lesserGems" | "regularGems" | "greaterGems";

interface GemDropRoll {
  readonly key: GemDropKey;
  readonly chance: number;
  readonly rolls: number;
}

/**
 * Unrevealed gems drop as kill credit, mirroring Canary's chances. We have
 * no forge classifications, so bestiary stars stand in (TODO.md):
 * bosstiary bosses roll the archfoe table, 5-star monsters the fiendish
 * table, 4-star monsters the influenced table.
 */
const ARCHFOE_ROLLS: ReadonlyArray<GemDropRoll> = [
  { key: "regularGems", chance: 0.09, rolls: 2 },
  { key: "greaterGems", chance: 0.03, rolls: 1 },
];
const FIENDISH_ROLLS: ReadonlyArray<GemDropRoll> = [
  { key: "lesserGems", chance: 0.03, rolls: 2 },
  { key: "regularGems", chance: 0.03, rolls: 2 },
  { key: "greaterGems", chance: 0.09, rolls: 1 },
];
const INFLUENCED_ROLLS: ReadonlyArray<GemDropRoll> = [
  { key: "lesserGems", chance: 0.09, rolls: 2 },
];

export class GemDropHooks implements BestiaryHooks {
  constructor(
    private readonly catalog: BestiaryCatalog,
    private readonly registry: SessionRegistry,
    private readonly tracker: GemTracker,
    private readonly service: GemAtelierService,
    private readonly random: () => number = Math.random,
  ) {}

  onMonsterKilled(
    damagerIds: ReadonlyArray<string>,
    monster: Monster,
    now: number,
  ): void {
    const raceId = this.catalog.raceIdByMonsterTypeId.get(monster.type.id);
    if (raceId === undefined) return;
    const table = this.tableFor(raceId);
    if (!table) return;
    for (const characterId of new Set(damagerIds)) {
      const deltas: Partial<Record<GemDropKey, number>> = {};
      for (const roll of table) {
        for (let i = 0; i < roll.rolls; i++) {
          if (this.random() >= roll.chance) continue;
          deltas[roll.key] = (deltas[roll.key] ?? 0) + 1;
        }
      }
      if (Object.keys(deltas).length === 0) continue;
      this.tracker.creditGemDrops(characterId, deltas);
      const session = this.registry.sessionFor(characterId);
      if (session) this.service.notifyResourcesChanged(session, now);
    }
  }

  private tableFor(raceId: number): ReadonlyArray<GemDropRoll> | null {
    if (this.catalog.bossesByRaceId.has(raceId)) return ARCHFOE_ROLLS;
    const entry = this.catalog.entriesByRaceId.get(raceId);
    if (!entry) return null;
    if (entry.stars >= 5) return FIENDISH_ROLLS;
    if (entry.stars >= 4) return INFLUENCED_ROLLS;
    return null;
  }
}
