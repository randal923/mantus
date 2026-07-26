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
 * Unrevealed gems drop as kill credit, mirroring Canary's chances keyed on
 * the killed monster's real forge state (Feature 78 retired the old
 * bestiary-star stand-in): archfoe bosses roll the archfoe table, fiendish
 * and influenced instances their own tables.
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
    const table = this.tableFor(monster);
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

  private tableFor(monster: Monster): ReadonlyArray<GemDropRoll> | null {
    if (monster.forgeKind === "fiendish") return FIENDISH_ROLLS;
    if (monster.forgeKind === "influenced") return INFLUENCED_ROLLS;
    const raceId = this.catalog.raceIdByMonsterTypeId.get(monster.type.id);
    if (raceId === undefined) return null;
    return this.catalog.bossesByRaceId.get(raceId)?.category === "archfoe"
      ? ARCHFOE_ROLLS
      : null;
  }
}
