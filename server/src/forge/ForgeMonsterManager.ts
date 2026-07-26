import { FORGE_RULES } from "@tibia/protocol";
import type { WorldActionRng } from "../action/WorldActionRng";
import type { BestiaryCatalog } from "../bestiary/BestiaryCatalog";
import { normalRandomIndex } from "../boosted/normalRandomIndex";
import { Monster } from "../creature/Monster";
import type { Visibility } from "../Visibility";
import type { World } from "../World";

/**
 * Influenced/fiendish monster lifecycle (Feature 78), transcribed from
 * pinned Canary game.cpp:11840-12200: a 10 s sweep prunes dead states,
 * expires hour-old fiendish monsters, and tops the world back up — the
 * influenced pick is bell-curved (`normal_random`), the fiendish pick
 * uniform, and every assignment happens server-side at the sweep, never
 * from the network.
 *
 * Deviation (recorded in done.md): Canary caps at 300 influenced / 4
 * fiendish over a fully-live world of tens of thousands of monsters.
 * Mantus only activates spawns near players, so absolute caps would make
 * nearly every live monster forged; the caps here scale with the eligible
 * live population instead, preserving upstream rarity.
 */
const INFLUENCED_PER_ELIGIBLE = 100;
const FIENDISH_PER_ELIGIBLE = 250;

export class ForgeMonsterManager {
  private nextSweepAt = 0;
  private nextInfluencedAt = 0;
  private nextFiendishAt = 0;

  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly catalog: BestiaryCatalog,
    private readonly rng: WorldActionRng,
    private readonly isSummon: (monster: Monster) => boolean,
  ) {}

  tick(now: number): void {
    if (now < this.nextSweepAt) return;
    this.nextSweepAt = now + FORGE_RULES.sweepIntervalMs;
    let influenced = 0;
    let fiendish = 0;
    const eligible: Monster[] = [];
    for (const creature of this.world.allCreatures()) {
      if (!(creature instanceof Monster)) continue;
      if (creature.forgeStack > 0) {
        // An hour-old fiendish monster reverts (game.cpp:12005-12014).
        if (
          creature.forgeKind === "fiendish" &&
          creature.fiendishUntil <= now
        ) {
          this.clearState(creature);
          eligible.push(creature);
          continue;
        }
        if (creature.forgeKind === "fiendish") fiendish += 1;
        else influenced += 1;
        continue;
      }
      if (this.canBeForgeMonster(creature)) eligible.push(creature);
    }
    const influencedTarget = Math.min(
      FORGE_RULES.influencedLimit,
      Math.ceil(eligible.length / INFLUENCED_PER_ELIGIBLE),
    );
    const fiendishTarget = Math.min(
      FORGE_RULES.fiendishLimit,
      Math.ceil(eligible.length / FIENDISH_PER_ELIGIBLE),
    );
    while (
      fiendish < fiendishTarget &&
      eligible.length > 0 &&
      now >= this.nextFiendishAt
    ) {
      const index = this.rng.integer(0, eligible.length - 1);
      const monster = eligible.splice(index, 1)[0];
      if (!monster) break;
      this.assign(monster, FORGE_RULES.fiendishStack, now);
      fiendish += 1;
    }
    while (
      influenced < influencedTarget &&
      eligible.length > 0 &&
      now >= this.nextInfluencedAt
    ) {
      const index = normalRandomIndex(
        () => this.rng.integer(0, 999_999_999) / 1_000_000_000,
        0,
        eligible.length - 1,
      );
      const monster = eligible.splice(index, 1)[0];
      if (!monster) break;
      this.assign(
        monster,
        normalRandomIndex(
          () => this.rng.integer(0, 999_999_999) / 1_000_000_000,
          1,
          FORGE_RULES.influencedMaxStack,
        ),
        now,
      );
      influenced += 1;
    }
  }

  /** Death bookkeeping: consumed states replenish after Canary's delays. */
  onForgeMonsterDied(monster: Monster, now: number): void {
    if (monster.forgeKind === "fiendish") {
      this.nextFiendishAt = now + FORGE_RULES.fiendishRespawnDelayMs;
    } else if (monster.forgeKind === "influenced") {
      this.nextInfluencedAt = now + FORGE_RULES.influencedRespawnDelayMs;
    }
  }

  private canBeForgeMonster(monster: Monster): boolean {
    // Canary monster.cpp:3890-3892: no stack, no summon, no reward boss,
    // drops loot, and a bestiary race to credit.
    return (
      monster.forgeStack === 0 &&
      !monster.type.flags.rewardBoss &&
      monster.type.loot.length > 0 &&
      this.catalog.raceIdByMonsterTypeId.has(monster.type.id) &&
      !this.isSummon(monster)
    );
  }

  private assign(monster: Monster, stack: number, now: number): void {
    monster.forgeStack = stack;
    monster.fiendishUntil =
      stack >= FORGE_RULES.fiendishStack
        ? now + FORGE_RULES.fiendishDurationMs
        : 0;
    // Canary applyStacks (monster.cpp:3557-3563): health scales by
    // 1 + (15 * stack + 35) / 100 and the monster is set to full.
    const multiplier = 1 + (15 * stack + 35) / 100;
    monster.setMaxHealth(Math.ceil(monster.maxHealth * multiplier));
    monster.setHealth(monster.maxHealth);
    this.visibility.onCreatureStateChanged(monster);
    this.visibility.broadcastHealth(monster);
  }

  private clearState(monster: Monster): void {
    const multiplier = 1 + (15 * monster.forgeStack + 35) / 100;
    monster.forgeStack = 0;
    monster.fiendishUntil = 0;
    monster.setMaxHealth(
      Math.max(1, Math.round(monster.maxHealth / multiplier)),
    );
    this.visibility.onCreatureStateChanged(monster);
    this.visibility.broadcastHealth(monster);
  }
}
