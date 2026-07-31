import type { BoostedStateMessage, BoostedEntry } from "@tibia/protocol";
import { BOOSTED_RULES } from "@tibia/protocol";
import type { WorldActionRng } from "../action/WorldActionRng";
import type { BestiaryCatalog } from "../bestiary/BestiaryCatalog";
import type { Monster } from "../creature/Monster";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { BoostedHooks } from "./BoostedHooks";
import type { BoostedSelectionRecord, BoostedStore } from "./BoostedStore";
import { localDayKey } from "./localDayKey";
import { normalRandomIndex } from "./normalRandomIndex";

/**
 * Daily boosted creature/boss (Feature 76), transcribed from pinned Canary
 * game.cpp:770-844 and io_bosstiary.cpp:22-124. Selection is server-side
 * with server RNG: the creature comes from the whole bestiary excluding
 * yesterday's race via Canary's bell-curved `normal_random` over the
 * race-id-sorted list; the boss uniformly from the archfoe pool. The durable
 * day row is the selection (exactly-once across processes); modifiers are
 * read from live state at execution time by the kill/loot/spawn paths.
 *
 * Deviation vs Canary (recorded in done.md): rotation happens at the day
 * boundary inside the tick, not only at server start, and boosted matching
 * uses race ids, so look-variant monsters sharing a race are all boosted
 * where Canary compares the primary name only.
 */
export class BoostedService implements BoostedHooks {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private current: BoostedSelectionRecord | null = null;
  private rotating = false;
  private onRotatedCallback: ((record: BoostedSelectionRecord) => void) | null =
    null;

  constructor(
    private readonly registry: SessionRegistry,
    private readonly catalog: BestiaryCatalog,
    private readonly rng: WorldActionRng,
    private readonly store?: BoostedStore,
  ) {}

  /** Fires after a new day's selection commits (slot clears already done). */
  set onRotated(callback: (record: BoostedSelectionRecord) => void) {
    this.onRotatedCallback = callback;
  }

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  tick(now: number): void {
    if (!this.store || this.rotating) return;
    const day = localDayKey(now);
    if (this.current?.day === day) return;
    this.rotating = true;
    this.track(this.rotate(day));
  }

  announceTo(session: Session): void {
    session.send(this.projectState());
  }

  publicSelection(): {
    readonly creature: BoostedEntry | null;
    readonly boss: BoostedEntry | null;
  } {
    const state = this.projectState();
    return { creature: state.creature, boss: state.boss };
  }

  isBoostedCreature(monster: Monster): boolean {
    const record = this.current;
    if (!record) return false;
    const raceId = this.catalog.raceIdByMonsterTypeId.get(monster.type.id);
    return raceId !== undefined && raceId === record.creatureRaceId;
  }

  bossKillIncrement(raceId: number): number {
    return raceId === this.boostedBossRaceId()
      ? BOOSTED_RULES.bossKillBonus
      : 1;
  }

  respawnDelayDivisor(monsterTypeId: string): number {
    const record = this.current;
    if (!record) return 1;
    const raceId = this.catalog.raceIdByMonsterTypeId.get(monsterTypeId);
    return raceId === record.creatureRaceId
      ? BOOSTED_RULES.creatureSpawnIntervalDivisor
      : 1;
  }

  boostedBossRaceId(): number | null {
    return this.current?.bossRaceId ?? null;
  }

  boostedCreatureRaceId(): number | null {
    return this.current?.creatureRaceId ?? null;
  }

  private async rotate(day: string): Promise<void> {
    const store = this.store;
    if (!store) return;
    try {
      const previous =
        this.current ?? (await store.load(this.previousDay(day)));
      const candidate = this.select(day, previous?.creatureRaceId ?? null);
      const { record, created } = await store.ensure(candidate);
      if (created && record.bossRaceId !== null) {
        // Canary clears the new boosted boss out of every player's slots.
        await store.clearBossSlotsFor(record.bossRaceId);
      }
      this.outcomes.push(() => {
        this.current = record;
        if (!created) return;
        this.onRotatedCallback?.(record);
        for (const session of this.registry.all()) {
          if (session.playerId) session.send(this.projectState());
        }
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`boosted rotation for ${day} failed: ${reason}`);
    } finally {
      this.outcomes.push(() => {
        this.rotating = false;
      });
    }
  }

  private select(
    day: string,
    previousCreatureRaceId: number | null,
  ): BoostedSelectionRecord {
    const creatures = [...this.catalog.entriesByRaceId.values()]
      .filter((entry) => entry.raceId !== previousCreatureRaceId)
      .sort((a, b) => a.raceId - b.raceId);
    if (creatures.length === 0) {
      throw new Error("bestiary catalog has no boostable creatures");
    }
    const creatureIndex = normalRandomIndex(
      () => this.rng.integer(0, 999_999_999) / 1_000_000_000,
      0,
      creatures.length - 1,
    );
    const creature = creatures[creatureIndex];
    if (!creature) throw new Error("boosted creature index out of range");
    // Archfoes only, uniform, no yesterday exclusion (io_bosstiary.cpp:55-71).
    const archfoes = [...this.catalog.bossesByRaceId.values()]
      .filter((boss) => boss.category === "archfoe")
      .sort((a, b) => a.raceId - b.raceId);
    const boss = archfoes.length > 1 ? this.rng.pick(archfoes) : null;
    return {
      day,
      creatureRaceId: creature.raceId,
      creatureName: creature.monsterType.name,
      bossRaceId: boss?.raceId ?? null,
      bossName: boss?.monsterType.name ?? null,
    };
  }

  private projectState(): BoostedStateMessage {
    return {
      type: "boosted-state",
      creature: this.entryFor(this.current?.creatureRaceId ?? null),
      boss: this.entryFor(this.current?.bossRaceId ?? null),
    };
  }

  private entryFor(raceId: number | null): BoostedEntry | null {
    if (raceId === null) return null;
    const type =
      this.catalog.entriesByRaceId.get(raceId)?.monsterType ??
      this.catalog.bossesByRaceId.get(raceId)?.monsterType;
    if (!type) return null;
    return { raceId, name: type.name, lookTypeId: type.outfit.lookType };
  }

  private previousDay(day: string): string {
    const parsed = new Date(`${day}T12:00:00`);
    parsed.setDate(parsed.getDate() - 1);
    return localDayKey(parsed.getTime());
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }
}
