import type { BoostedHooks } from "../boosted/BoostedHooks";
import type { Monster } from "../creature/Monster";
import type { SessionRegistry } from "../SessionRegistry";
import type { BestiaryCatalog } from "./BestiaryCatalog";
import type { BestiaryHooks } from "./BestiaryHooks";
import type { BestiaryStore } from "./BestiaryStore";
import { getBestiaryStage } from "./getBestiaryStage";
import { getBossMilestones } from "./getBossMilestones";

/**
 * In-memory kill counters for online characters. Counts load once at login
 * and mutate only inside the tick (charter rules 3 and 5); each increment
 * is persisted with a single idempotent upsert delta.
 */
export class BestiaryTracker implements BestiaryHooks {
  private readonly killsByCharacter = new Map<string, Map<number, number>>();
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(
    private readonly catalog: BestiaryCatalog,
    private readonly registry: SessionRegistry,
    private readonly store?: BestiaryStore,
    private readonly boostedHooks?: BoostedHooks,
    private readonly killRates: {
      bestiaryKills: number;
      bosstiaryKills: number;
    } = { bestiaryKills: 1, bosstiaryKills: 1 },
  ) {}

  async load(characterId: string): Promise<ReadonlyMap<number, number>> {
    if (!this.store) return new Map();
    return this.store.loadKills(characterId);
  }

  attach(characterId: string, kills: ReadonlyMap<number, number>): void {
    this.killsByCharacter.set(characterId, new Map(kills));
  }

  detachCharacter(characterId: string): void {
    this.killsByCharacter.delete(characterId);
  }

  killsFor(characterId: string): ReadonlyMap<number, number> {
    return this.killsByCharacter.get(characterId) ?? new Map();
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingWrites]);
  }

  onMonsterKilled(
    damagerIds: ReadonlyArray<string>,
    monster: Monster,
    now: number,
  ): void {
    void now;
    const raceId = this.catalog.raceIdByMonsterTypeId.get(monster.type.id);
    if (raceId === undefined) return;
    // The boosted boss counts triple (Canary player.cpp:6565-6567) and
    // stacks on top of the configured bosstiary kill rate.
    const increment = this.catalog.bossesByRaceId.has(raceId)
      ? (this.boostedHooks?.bossKillIncrement(raceId) ?? 1) *
        this.killRates.bosstiaryKills
      : this.killRates.bestiaryKills;
    for (const characterId of new Set(damagerIds)) {
      const kills = this.killsByCharacter.get(characterId);
      if (!kills) continue;
      const after = (kills.get(raceId) ?? 0) + increment;
      kills.set(raceId, after);
      this.announceKill(characterId, raceId, after);
      this.persist(characterId, raceId, increment);
    }
  }

  /** Every kill is pushed so the client-side cached bestiary stays fresh. */
  private announceKill(
    characterId: string,
    raceId: number,
    kills: number,
  ): void {
    const entry = this.catalog.entriesByRaceId.get(raceId);
    if (entry) {
      this.registry.sessionFor(characterId)?.send({
        type: "bestiary-entry-changed",
        scope: "bestiary",
        raceId,
        name: entry.monsterType.name,
        kills,
        stage: getBestiaryStage(entry, kills),
      });
      return;
    }
    const boss = this.catalog.bossesByRaceId.get(raceId);
    if (!boss) return;
    this.registry.sessionFor(characterId)?.send({
      type: "bestiary-entry-changed",
      scope: "bosstiary",
      raceId,
      name: boss.monsterType.name,
      kills,
      stage: getBossMilestones(boss.category, kills).reached,
    });
  }

  private persist(characterId: string, raceId: number, amount: number): void {
    const store = this.store;
    if (!store) return;
    const write = store.addKills(characterId, raceId, amount).catch((cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(
        `failed to persist bestiary kill ${raceId} for ${characterId}: ${reason}`,
      );
    });
    this.pendingWrites.add(write);
    void write.finally(() => this.pendingWrites.delete(write));
  }
}
