import { ANIMUS_RULES } from "@tibia/protocol";
import type { BestiaryCatalog } from "../bestiary/BestiaryCatalog";
import type { Monster } from "../creature/Monster";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { ProficiencyStore } from "./ProficiencyStore";

/**
 * Animus mastery (Feature 82), transcribed from pinned Canary
 * animus_mastery.cpp: kills of a mastered race gain
 * min(4, 1 + (2 + floor(N / 10) * 0.1) / 100) experience, composed last in
 * the exp pipeline (player.cpp:3588-3603). The earn path (Soul Pit soul
 * cores from fiendish monsters) is a recorded residual; grants only ever
 * come from server-side systems through `grant`.
 */
export class AnimusService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly masteriesByCharacter = new Map<string, Set<number>>();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly catalog: BestiaryCatalog,
    private readonly store?: ProficiencyStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detachCharacter(characterId: string): void {
    this.masteriesByCharacter.delete(characterId);
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) {
      this.masteriesByCharacter.set(characterId, new Set());
      return;
    }
    this.track(
      store.loadAnimus(characterId).then(
        (raceIds) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.masteriesByCharacter.set(characterId, new Set(raceIds));
            this.announce(characterId);
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`animus load failed for ${characterId}: ${reason}`);
        },
      ),
    );
  }

  /** Server-side grant surface (GM/quests); idempotent per race. */
  grant(characterId: string, raceId: number): boolean {
    if (!this.catalog.entriesByRaceId.has(raceId)) return false;
    const masteries = this.masteriesByCharacter.get(characterId);
    if (!masteries || masteries.has(raceId)) return false;
    masteries.add(raceId);
    const store = this.store;
    if (store) {
      this.track(
        store.grantAnimus(characterId, raceId).catch((cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`animus grant failed for ${characterId}: ${reason}`);
        }),
      );
    }
    this.announce(characterId);
    return true;
  }

  /**
   * Canary animus_mastery.cpp:48-52 — the multiplier for one kill; 1 when
   * the killed race is not mastered by this recipient.
   */
  multiplierFor(recipientId: string, monster: Monster): number {
    const masteries = this.masteriesByCharacter.get(recipientId);
    if (!masteries || masteries.size === 0) return 1;
    const raceId = this.catalog.raceIdByMonsterTypeId.get(monster.type.id);
    if (raceId === undefined || !masteries.has(raceId)) return 1;
    return this.multiplierOf(masteries.size);
  }

  private multiplierOf(count: number): number {
    const steps = Math.floor(count / ANIMUS_RULES.monstersPerStep);
    return Math.min(
      ANIMUS_RULES.maxMultiplier,
      1 +
        (ANIMUS_RULES.baseBonusPercent +
          steps * ANIMUS_RULES.perTenBonusPercent) /
          100,
    );
  }

  private announce(characterId: string): void {
    const session = this.registry.sessionFor(characterId);
    const masteries = this.masteriesByCharacter.get(characterId);
    if (!session || !masteries) return;
    session.send({
      type: "animus-state",
      raceIds: [...masteries].sort((a, b) => a - b).slice(0, 2_048),
      bonusTenthsPercent:
        masteries.size === 0
          ? 0
          : Math.round((this.multiplierOf(masteries.size) - 1) * 1_000),
    });
  }

  private track(operation: Promise<unknown>): void {
    const tracked = operation.then(
      () => undefined,
      () => undefined,
    );
    this.pendingOperations.add(tracked);
    void tracked.finally(() => this.pendingOperations.delete(tracked));
  }
}
