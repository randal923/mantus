import {
  BESTIARY_LIMITS,
  BOSS_SLOT_RULES,
  BOSSTIARY_MILESTONES,
  bossPointsLootBonus,
  bossSlotRemovePrice,
  BOOSTED_RULES,
  type BossSlotEntry,
  type BossSlotFailedReason,
  type BossSlotSetMessage,
  type BossSlotsStateMessage,
} from "@tibia/protocol";
import type { BoostedHooks } from "../boosted/BoostedHooks";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { BestiaryCatalog } from "./BestiaryCatalog";
import type { BestiaryTracker } from "./BestiaryTracker";
import type { BossSlotRecord, BossSlotStore } from "./BossSlotStore";
import { getBossMilestones } from "./getBossMilestones";

/**
 * Bosstiary boss slots (Feature 76), transcribed from pinned Canary
 * io_bosstiary.cpp and protocolgame.cpp:11186-11258. Slot one unlocks with
 * the first boss at Prowess, slot two at 1500 boss points; assignments are
 * validated against the character's own kill counts at execution time.
 * Clearing a slot charges Canary's removal curve as a bank debit in one
 * transaction with the slot row — unlike upstream, an unfunded removal is
 * refused instead of ignored (game.cpp:11229 drops the removeMoney result).
 * The slot loot bonus feeds Feature 84's reward-chest rolls when they land.
 */
export class BossSlotService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly recordsByCharacter = new Map<string, BossSlotRecord>();
  /** Characters with a removal charge in flight; blocks a second one. */
  private readonly pendingCharges = new Set<string>();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly catalog: BestiaryCatalog,
    private readonly kills: BestiaryTracker,
    private readonly boostedHooks?: BoostedHooks,
    private readonly store?: BossSlotStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  detachCharacter(characterId: string): void {
    this.recordsByCharacter.delete(characterId);
    this.pendingCharges.delete(characterId);
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) {
      this.recordsByCharacter.set(characterId, emptyRecord());
      return;
    }
    this.track(
      store.load(characterId).then(
        (record) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.recordsByCharacter.set(characterId, record ?? emptyRecord());
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`boss slot load failed for ${characterId}: ${reason}`);
        },
      ),
    );
  }

  /** Rotation side effect: the new boosted boss leaves in-memory slots too. */
  onBoostedBossRotated(raceId: number): void {
    for (const [characterId, record] of this.recordsByCharacter) {
      if (
        record.slotOneRaceId !== raceId &&
        record.slotTwoRaceId !== raceId
      ) {
        continue;
      }
      this.recordsByCharacter.set(characterId, {
        slotOneRaceId:
          record.slotOneRaceId === raceId ? null : record.slotOneRaceId,
        slotTwoRaceId:
          record.slotTwoRaceId === raceId ? null : record.slotTwoRaceId,
        removeCount: record.removeCount,
      });
      const session = this.registry.sessionFor(characterId);
      if (session) session.send(this.projectState(characterId));
    }
  }

  handleGet(session: Session, now: number): void {
    const characterId = session.playerId;
    if (!characterId || !this.guard(session, now)) return;
    if (!this.recordsByCharacter.has(characterId)) return;
    session.send(this.projectState(characterId));
  }

  handleSet(session: Session, intent: BossSlotSetMessage, now: number): void {
    const characterId = session.playerId;
    if (!characterId || !this.guard(session, now)) return;
    const record = this.recordsByCharacter.get(characterId);
    if (!record) return;
    if (this.pendingCharges.has(characterId)) {
      return this.fail(session, "rate-limited");
    }
    const kills = this.kills.killsFor(characterId);
    const unlocked = this.unlockedRaceIds(characterId);
    if (intent.slot === 0 && unlocked.length === 0) {
      return this.fail(session, "slot-locked");
    }
    if (intent.slot === 1) {
      const points = this.bossPoints(characterId);
      if (points < BOSS_SLOT_RULES.slotTwoUnlockPoints) {
        return this.fail(session, "slot-locked");
      }
    }
    const current =
      intent.slot === 0 ? record.slotOneRaceId : record.slotTwoRaceId;
    if (intent.raceId !== null) {
      const boss = this.catalog.bossesByRaceId.get(intent.raceId);
      if (!boss) return this.fail(session, "invalid-request");
      const prowessKills = BOSSTIARY_MILESTONES[boss.category][0]?.kills ?? 1;
      if ((kills.get(intent.raceId) ?? 0) < prowessKills) {
        return this.fail(session, "not-unlocked");
      }
      const other =
        intent.slot === 0 ? record.slotTwoRaceId : record.slotOneRaceId;
      if (other === intent.raceId || current === intent.raceId) {
        return this.fail(session, "already-slotted");
      }
      if (intent.raceId === this.boostedHooks?.boostedBossRaceId()) {
        return this.fail(session, "boosted-boss");
      }
      this.apply(characterId, this.withSlot(record, intent.slot, intent.raceId));
      session.send(this.projectState(characterId));
      return;
    }
    if (current === null) {
      session.send(this.projectState(characterId));
      return;
    }
    // Clearing the slot of today's boosted boss is free and does not count
    // as a removal (game.cpp:11234-11236).
    if (current === this.boostedHooks?.boostedBossRaceId()) {
      this.apply(characterId, this.withSlot(record, intent.slot, null));
      session.send(this.projectState(characterId));
      return;
    }
    const price = bossSlotRemovePrice(record.removeCount);
    const next: BossSlotRecord = {
      ...this.withSlot(record, intent.slot, null),
      removeCount: record.removeCount + 1,
    };
    if (price <= 0) {
      this.apply(characterId, next);
      session.send(this.projectState(characterId));
      return;
    }
    const store = this.store;
    if (!store) {
      this.apply(characterId, next);
      session.send(this.projectState(characterId));
      return;
    }
    this.pendingCharges.add(characterId);
    this.track(
      store.chargeRemove(characterId, price, next).then(
        (result) => {
          this.outcomes.push(() => {
            this.pendingCharges.delete(characterId);
            const active = this.registry.sessionFor(characterId);
            if (result.status !== "committed") {
              if (active) this.fail(active, "insufficient-gold");
              return;
            }
            this.recordsByCharacter.set(characterId, next);
            if (active) active.send(this.projectState(characterId));
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(
            `boss slot removal charge failed for ${characterId}: ${reason}`,
          );
          this.outcomes.push(() => {
            this.pendingCharges.delete(characterId);
            const active = this.registry.sessionFor(characterId);
            if (active) this.fail(active, "invalid-request");
          });
        },
      ),
    );
  }

  /**
   * Reward-chest read (Canary reward_chest.lua:90-93): the slotted boss's
   * loot bonus for this character, or null when the boss isn't slotted.
   * Only attached (online) characters have slot records; an offline
   * participant collects base rolls.
   */
  lootBonusPercentFor(characterId: string, raceId: number): number | null {
    const record = this.recordsByCharacter.get(characterId);
    if (
      !record ||
      (record.slotOneRaceId !== raceId && record.slotTwoRaceId !== raceId)
    ) {
      return null;
    }
    const boss = this.catalog.bossesByRaceId.get(raceId);
    const count = this.kills.killsFor(characterId).get(raceId) ?? 0;
    const mastery =
      boss !== undefined && getBossMilestones(boss.category, count).reached === 3;
    return (
      bossPointsLootBonus(this.bossPoints(characterId)) +
      (mastery ? BOSS_SLOT_RULES.masteryLootBonus : 0)
    );
  }

  private projectState(characterId: string): BossSlotsStateMessage {
    const record = this.recordsByCharacter.get(characterId) ?? emptyRecord();
    const kills = this.kills.killsFor(characterId);
    const unlocked = this.unlockedRaceIds(characterId);
    const points = this.bossPoints(characterId);
    const baseBonus = bossPointsLootBonus(points);
    const boostedRaceId = this.boostedHooks?.boostedBossRaceId() ?? null;
    const slots: BossSlotEntry[] = ([0, 1] as const).map((slot) => {
      const raceId = slot === 0 ? record.slotOneRaceId : record.slotTwoRaceId;
      const boss = raceId ? this.catalog.bossesByRaceId.get(raceId) : undefined;
      const count = raceId ? kills.get(raceId) ?? 0 : 0;
      const mastery =
        boss && getBossMilestones(boss.category, count).reached === 3;
      return {
        slot,
        raceId,
        kills: count,
        lootBonusPercent:
          baseBonus + (mastery ? BOSS_SLOT_RULES.masteryLootBonus : 0),
        inactive: raceId !== null && raceId === boostedRaceId,
      };
    });
    const boostedBoss = boostedRaceId
      ? this.catalog.bossesByRaceId.get(boostedRaceId)
      : undefined;
    return {
      type: "boss-slots-state",
      slotOneUnlocked: unlocked.length > 0,
      slotTwoUnlocked: points >= BOSS_SLOT_RULES.slotTwoUnlockPoints,
      bossPoints: points,
      slots,
      nextRemovePriceGold: bossSlotRemovePrice(record.removeCount),
      unlockedRaceIds: unlocked.slice(0, 256),
      boosted:
        boostedRaceId && boostedBoss
          ? {
              raceId: boostedRaceId,
              kills: kills.get(boostedRaceId) ?? 0,
              killBonus: BOOSTED_RULES.bossKillBonus,
              lootBonusPercent: BOOSTED_RULES.bossLootBonusPercent,
            }
          : null,
    };
  }

  private unlockedRaceIds(characterId: string): number[] {
    const kills = this.kills.killsFor(characterId);
    const boostedRaceId = this.boostedHooks?.boostedBossRaceId() ?? null;
    const unlocked: number[] = [];
    for (const boss of this.catalog.bossesByRaceId.values()) {
      // The boosted boss is excluded from the assignable list; it already
      // occupies the free third slot (protocolgame.cpp:11186-11191).
      if (boss.raceId === boostedRaceId) continue;
      const prowessKills = BOSSTIARY_MILESTONES[boss.category][0]?.kills ?? 1;
      if ((kills.get(boss.raceId) ?? 0) >= prowessKills) {
        unlocked.push(boss.raceId);
      }
    }
    return unlocked.sort((a, b) => a - b);
  }

  private bossPoints(characterId: string): number {
    const kills = this.kills.killsFor(characterId);
    let points = 0;
    for (const boss of this.catalog.bossesByRaceId.values()) {
      const count = kills.get(boss.raceId) ?? 0;
      if (count > 0) points += getBossMilestones(boss.category, count).points;
    }
    return points;
  }

  private withSlot(
    record: BossSlotRecord,
    slot: number,
    raceId: number | null,
  ): BossSlotRecord {
    return {
      slotOneRaceId: slot === 0 ? raceId : record.slotOneRaceId,
      slotTwoRaceId: slot === 1 ? raceId : record.slotTwoRaceId,
      removeCount: record.removeCount,
    };
  }

  private apply(characterId: string, record: BossSlotRecord): void {
    this.recordsByCharacter.set(characterId, record);
    const store = this.store;
    if (!store) return;
    this.track(
      store.save(characterId, record).catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`boss slot persist failed for ${characterId}: ${reason}`);
      }),
    );
  }

  private guard(session: Session, now: number): boolean {
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) return false;
    this.cooldownBySession.set(
      session.id,
      now + BESTIARY_LIMITS.actionCooldownMs,
    );
    return true;
  }

  private fail(session: Session, reason: BossSlotFailedReason): void {
    session.send({ type: "boss-slot-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }
}

function emptyRecord(): BossSlotRecord {
  return { slotOneRaceId: null, slotTwoRaceId: null, removeCount: 0 };
}
