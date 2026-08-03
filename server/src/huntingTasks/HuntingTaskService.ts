import {
  TASK_HUNTING_LIMITS,
  TASK_HUNTING_RULES,
  taskHuntingOptionFor,
  type TaskHuntingActionFailedReason,
  type TaskHuntingActionMessage,
  type TaskHuntingSlot,
  type TaskHuntingStateMessage,
} from "@tibia/protocol";
import type { WorldActionRng } from "../action/WorldActionRng";
import type { BestiaryCatalog } from "../bestiary/BestiaryCatalog";
import type { Monster } from "../creature/Monster";
import { rollMonsterGrid, type GridCandidate } from "../prey/rollMonsterGrid";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { LoginLoadQueue } from "../character/LoginLoadQueue";
import type { HuntingTaskStore, TaskSlotRecord } from "./HuntingTaskStore";
import { rollTaskRarity } from "./rollTaskRarity";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

interface PoolEntry extends GridCandidate {
  readonly name: string;
  readonly lookTypeId: number;
  readonly toKill: number;
}

/**
 * Hunting tasks (Feature 75), transcribed from pinned Canary ioprey.cpp.
 *
 * Kill credit rides the same server death path as the bestiary — every
 * damage participant of a monster death counts once — and only mutates
 * in-memory state inside the tick. Gold/wildcard spends and the claim's
 * point grant are performed by the store in one ACID transaction with the
 * ledger/audit rows; the claim's conditional SQL guard re-checks selection,
 * kills, and state at execution, so racing claims grant exactly once.
 */
export class HuntingTaskService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly slotsByCharacter = new Map<string, TaskSlotRecord[]>();
  private readonly taskPointsByCharacter = new Map<string, number>();
  private readonly wildcardsByCharacter = new Map<string, number>();
  private readonly pendingSlotCharges = new Set<string>();
  /** Server clock as of the last public entry point; drives projections. */
  private clockNow = 0;
  private readonly pool: ReadonlyArray<PoolEntry>;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly catalog: BestiaryCatalog,
    private readonly rng: WorldActionRng,
    private readonly bestiaryKillsFor: (
      characterId: string,
    ) => ReadonlyMap<number, number>,
    private readonly store?: HuntingTaskStore,
    private readonly loginLoads: LoginLoadQueue = new LoginLoadQueue(),
  ) {
    const pool: PoolEntry[] = [];
    for (const entry of catalog.entriesByRaceId.values()) {
      if (entry.monsterType.experience <= 0) continue;
      pool.push({
        raceId: entry.raceId,
        stars: entry.stars,
        preyExclusive: entry.preyExclusive,
        name: entry.monsterType.name,
        lookTypeId: entry.monsterType.outfit.lookType,
        toKill: entry.toKill,
      });
    }
    this.pool = pool.sort((a, b) => a.name.localeCompare(b.name));
  }

  applyResolvedOutcomes(now: number): void {
    this.clockNow = now;
    this.outcomes.applyAll(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  detachCharacter(characterId: string): void {
    this.slotsByCharacter.delete(characterId);
    this.taskPointsByCharacter.delete(characterId);
    this.wildcardsByCharacter.delete(characterId);
  }

  /** Durable task point balance (a Wheel point source, Feature 80). */
  taskPointsOf(characterId: string): number {
    return this.taskPointsByCharacter.get(characterId) ?? 0;
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    const loaded = this.loginLoads.run(characterId, () =>
      store.load(characterId),
    );
    this.track(
      loaded.then(
        (snapshot) => {
          this.outcomes.push((now) => {
            if (this.registry.sessionFor(characterId) !== session) return;
            const player = this.world.getPlayer(characterId);
            if (!player) return;
            if (!snapshot) {
              const slots = this.freshSlots(
                player.level,
                player.isPremiumAt(now),
                now,
              );
              this.slotsByCharacter.set(characterId, slots);
              this.taskPointsByCharacter.set(characterId, 0);
              this.wildcardsByCharacter.set(characterId, 0);
              this.track(
                store
                  .initialize(characterId, slots)
                  .catch((cause: unknown) => this.warn(characterId, cause)),
              );
              this.sendState(session, characterId);
              return;
            }
            const slots = snapshot.slots.map((record) => ({ ...record }));
            const second = slots[1];
            if (second && second.state === "locked" && player.isPremiumAt(now)) {
              slots[1] = {
                ...second,
                state: "selection",
                grid: this.rollGrid(slots, player.level),
                freeRerollAtMs:
                  now + TASK_HUNTING_RULES.freeRerollSeconds * 1000,
              };
              this.persistSlot(characterId, slots[1]);
            }
            // Canary load fixup: an exhausted slot whose timer has passed
            // re-opens as Selection.
            for (const [index, slot] of slots.entries()) {
              if (slot.state === "inactive" && slot.disabledUntilMs < now) {
                slots[index] = { ...slot, state: "selection" };
                this.persistSlot(characterId, slots[index]);
              }
            }
            this.slotsByCharacter.set(characterId, slots);
            this.taskPointsByCharacter.set(characterId, snapshot.taskPoints);
            this.wildcardsByCharacter.set(characterId, snapshot.wildcards);
            this.sendState(session, characterId);
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  /** True when no slot is still locked, so the store's slot offer is spent. */
  allSlotsUnlocked(characterId: string): boolean {
    const slots = this.slotsByCharacter.get(characterId);
    return slots !== undefined && slots.every((slot) => slot.state !== "locked");
  }

  /**
   * Unlocks a slot the Mantus Store already unlocked durably (Canary's
   * Permanent Hunting Task Slot). Refresh-only: the row was written inside
   * the purchase transaction, so nothing is decided here.
   */
  applyStoreSlotUnlock(characterId: string, slot: number): void {
    this.outcomes.push((now) => {
      const slots = this.slotsByCharacter.get(characterId);
      const record = slots?.[slot];
      if (!slots || !record || record.state !== "locked") return;
      const player = this.world.getPlayer(characterId);
      this.replaceSlot(characterId, {
        ...record,
        state: "selection",
        grid: this.rollGrid(slots, player?.level ?? 1),
        freeRerollAtMs: now + TASK_HUNTING_RULES.freeRerollSeconds * 1000,
      });
      const session = this.registry.sessionFor(characterId);
      if (session) this.sendState(session, characterId);
    });
  }

  /** Same damagers set as the bestiary; counting continues past the goal. */
  onMonsterKilled(
    damagerIds: ReadonlyArray<string>,
    monster: Monster,
    now: number,
  ): void {
    this.clockNow = now;
    const raceId = this.catalog.raceIdByMonsterTypeId.get(monster.type.id);
    if (raceId === undefined) return;
    for (const characterId of new Set(damagerIds)) {
      const slots = this.slotsByCharacter.get(characterId);
      if (!slots) continue;
      const slot = slots.find(
        (candidate) =>
          candidate.selectedRaceId === raceId &&
          (candidate.state === "active" || candidate.state === "completed"),
      );
      if (!slot) continue;
      const option = this.optionFor(slot);
      if (!option) continue;
      const kills = Math.min(TASK_HUNTING_LIMITS.maxKills, slot.kills + 1);
      const goal = slot.upgrade ? option.secondKills : option.firstKills;
      const updated: TaskSlotRecord = {
        ...slot,
        kills,
        state: slot.state === "active" && kills >= goal ? "completed" : slot.state,
      };
      this.replaceSlot(characterId, updated);
      this.persistSlot(characterId, updated);
      const session = this.registry.sessionFor(characterId);
      if (session) this.sendState(session, characterId);
    }
  }

  handle(
    session: Session,
    intent: TaskHuntingActionMessage,
    now: number,
  ): void {
    this.clockNow = now;
    const characterId = session.playerId;
    const player = characterId ? this.world.getPlayer(characterId) : undefined;
    if (!characterId || !player) {
      session.sendError("join-required");
      return;
    }
    if (!this.store) {
      this.fail(session, "invalid-request");
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(
      session.id,
      now + TASK_HUNTING_LIMITS.actionCooldownMs,
    );
    const slots = this.slotsByCharacter.get(characterId);
    const slot = slots?.[intent.slot];
    if (!slots || !slot) {
      this.fail(session, "invalid-request");
      return;
    }
    if (slot.state === "locked") {
      this.fail(session, "slot-locked");
      return;
    }
    if (this.pendingSlotCharges.has(`${characterId}:${intent.slot}`)) {
      this.fail(session, "rate-limited");
      return;
    }
    switch (intent.action) {
      case "list-reroll":
        this.listReroll(session, characterId, player.level, slots, slot, now);
        return;
      case "star-reroll":
        this.starReroll(session, characterId, slot);
        return;
      case "wildcard-list":
        this.wildcardList(session, characterId, slot, now);
        return;
      case "select-monster":
        this.selectMonster(session, characterId, slots, slot, intent, now);
        return;
      case "cancel":
        this.cancel(session, characterId, player.level, slots, slot);
        return;
      case "claim":
        this.claim(session, characterId, player.level, slots, slot, now);
        return;
    }
  }

  // -------------------------------------------------------------- actions

  private listReroll(
    session: Session,
    characterId: string,
    level: number,
    slots: TaskSlotRecord[],
    slot: TaskSlotRecord,
    now: number,
  ): void {
    if (slot.disabledUntilMs >= now) {
      this.fail(session, "exhausted");
      return;
    }
    const free = slot.freeRerollAtMs <= now;
    const rerolled: TaskSlotRecord = {
      ...this.erasedTask(slot),
      rarity: rollTaskRarity(1, this.rng),
      state: "selection",
      grid: this.rollGrid(slots, level),
      freeRerollAtMs: free
        ? now + TASK_HUNTING_RULES.freeRerollSeconds * 1000
        : slot.freeRerollAtMs,
    };
    if (free) {
      this.replaceSlot(characterId, rerolled);
      this.persistSlot(characterId, rerolled);
      this.sendState(session, characterId);
      return;
    }
    this.chargeGold(session, characterId, rerolled, level, "reroll");
  }

  private starReroll(
    session: Session,
    characterId: string,
    slot: TaskSlotRecord,
  ): void {
    if (
      (this.wildcardsByCharacter.get(characterId) ?? 0) <
      TASK_HUNTING_RULES.starRerollPrice
    ) {
      this.fail(session, "insufficient-wildcards");
      return;
    }
    const rerolled: TaskSlotRecord = {
      ...slot,
      rarity: rollTaskRarity(slot.rarity, this.rng),
    };
    this.chargeWildcards(
      session,
      characterId,
      rerolled,
      TASK_HUNTING_RULES.starRerollPrice,
      "hunting-task-star-reroll",
    );
  }

  private wildcardList(
    session: Session,
    characterId: string,
    slot: TaskSlotRecord,
    now: number,
  ): void {
    if (slot.disabledUntilMs >= now) {
      this.fail(session, "exhausted");
      return;
    }
    if (
      (this.wildcardsByCharacter.get(characterId) ?? 0) <
      TASK_HUNTING_RULES.wildcardListPrice
    ) {
      this.fail(session, "insufficient-wildcards");
      return;
    }
    const listed: TaskSlotRecord = {
      ...slot,
      state: "list-selection",
      selectedRaceId: null,
    };
    this.chargeWildcards(
      session,
      characterId,
      listed,
      TASK_HUNTING_RULES.wildcardListPrice,
      "hunting-task-wildcard-list",
    );
  }

  private selectMonster(
    session: Session,
    characterId: string,
    slots: TaskSlotRecord[],
    slot: TaskSlotRecord,
    intent: TaskHuntingActionMessage,
    now: number,
  ): void {
    if (slot.disabledUntilMs >= now) {
      this.fail(session, "exhausted");
      return;
    }
    if (slot.state !== "selection" && slot.state !== "list-selection") {
      this.fail(session, "not-selectable");
      return;
    }
    if (slot.selectedRaceId !== null) {
      this.fail(session, "already-active");
      return;
    }
    const raceId = intent.raceId;
    if (raceId === undefined) {
      this.fail(session, "invalid-request");
      return;
    }
    if (slot.state === "selection" && !slot.grid.includes(raceId)) {
      this.fail(session, "invalid-request");
      return;
    }
    const entry = this.pool.find((candidate) => candidate.raceId === raceId);
    if (!entry) {
      this.fail(session, "not-selectable");
      return;
    }
    if (
      slots.some(
        (other) => other.slot !== slot.slot && other.selectedRaceId === raceId,
      )
    ) {
      this.fail(session, "duplicate-race");
      return;
    }
    const upgrade =
      intent.upgrade === true && this.upgradeUnlocked(characterId, entry);
    const selected: TaskSlotRecord = {
      ...slot,
      state: "active",
      selectedRaceId: raceId,
      kills: 0,
      grid: slot.grid.filter((id) => id !== raceId),
      upgrade,
    };
    this.replaceSlot(characterId, selected);
    this.persistSlot(characterId, selected);
    this.sendState(session, characterId);
  }

  private cancel(
    session: Session,
    characterId: string,
    level: number,
    slots: TaskSlotRecord[],
    slot: TaskSlotRecord,
  ): void {
    const cancelled: TaskSlotRecord = {
      ...this.erasedTask(slot),
      rarity: rollTaskRarity(1, this.rng),
      state: "selection",
      grid: this.rollGrid(slots, level),
    };
    this.chargeGold(session, characterId, cancelled, level, "cancel");
  }

  private claim(
    session: Session,
    characterId: string,
    level: number,
    slots: TaskSlotRecord[],
    slot: TaskSlotRecord,
    now: number,
  ): void {
    const store = this.store;
    if (!store) return;
    if (slot.selectedRaceId === null) {
      this.fail(session, "invalid-request");
      return;
    }
    const option = this.optionFor(slot);
    if (!option) {
      this.fail(session, "invalid-request");
      return;
    }
    const goal = slot.upgrade ? option.secondKills : option.firstKills;
    const rewardBase = slot.upgrade ? option.secondReward : option.firstReward;
    if (slot.kills < goal) {
      this.fail(session, "goal-not-met");
      return;
    }
    // Reward boost (ioprey.cpp:494-505): the roll always happens; only
    // 4★/5★ tasks can hit the 100 % / 50 % bonus.
    const roll = this.rng.integer(0, 100);
    const boost =
      slot.rarity >= 4 && roll <= 5 ? 20 : slot.rarity >= 4 && roll <= 10 ? 15 : 10;
    const points = Math.floor((rewardBase * boost) / 10);
    const raceId = slot.selectedRaceId;
    const claimed: TaskSlotRecord = {
      ...this.erasedTask(slot),
      rarity: rollTaskRarity(1, this.rng),
      state: "inactive",
      grid: this.rollGrid(slots, level),
      disabledUntilMs: now + TASK_HUNTING_RULES.exhaustSeconds * 1000,
    };
    const chargeKey = `${characterId}:${slot.slot}`;
    this.pendingSlotCharges.add(chargeKey);
    this.track(
      store
        .claimTask(
          characterId,
          { slot: slot.slot, raceId, minKills: goal },
          points,
          claimed,
        )
        .then(
          (result) => {
            this.outcomes.push(() => {
              this.pendingSlotCharges.delete(chargeKey);
              if (this.registry.sessionFor(characterId) !== session) return;
              if (result.status !== "committed") {
                this.fail(session, "goal-not-met");
                return;
              }
              this.taskPointsByCharacter.set(
                characterId,
                result.taskPointsAfter,
              );
              this.replaceSlot(characterId, claimed);
              this.sendState(session, characterId);
            });
          },
          (cause: unknown) => {
            this.pendingSlotCharges.delete(chargeKey);
            this.warn(characterId, cause);
          },
        ),
    );
  }

  // ------------------------------------------------------------- plumbing

  private chargeGold(
    session: Session,
    characterId: string,
    record: TaskSlotRecord,
    level: number,
    kind: "reroll" | "cancel",
  ): void {
    const store = this.store;
    if (!store) return;
    const price = level * TASK_HUNTING_RULES.rerollPricePerLevel;
    const chargeKey = `${characterId}:${record.slot}`;
    this.pendingSlotCharges.add(chargeKey);
    this.track(
      store.chargeGold(characterId, price, record, kind).then(
        (result) => {
          this.outcomes.push(() => {
            this.pendingSlotCharges.delete(chargeKey);
            if (this.registry.sessionFor(characterId) !== session) return;
            if (result.status !== "committed") {
              this.fail(session, "insufficient-gold");
              return;
            }
            this.replaceSlot(characterId, record);
            this.sendState(session, characterId);
          });
        },
        (cause: unknown) => {
          this.pendingSlotCharges.delete(chargeKey);
          this.warn(characterId, cause);
        },
      ),
    );
  }

  private chargeWildcards(
    session: Session,
    characterId: string,
    record: TaskSlotRecord,
    cost: number,
    event: "hunting-task-star-reroll" | "hunting-task-wildcard-list",
  ): void {
    const store = this.store;
    if (!store) return;
    const chargeKey = `${characterId}:${record.slot}`;
    this.pendingSlotCharges.add(chargeKey);
    this.track(
      store.spendWildcards(characterId, cost, event, record).then(
        (result) => {
          this.outcomes.push(() => {
            this.pendingSlotCharges.delete(chargeKey);
            if (this.registry.sessionFor(characterId) !== session) return;
            if (result.status !== "committed") {
              this.fail(session, "insufficient-wildcards");
              return;
            }
            this.wildcardsByCharacter.set(characterId, result.wildcardsAfter);
            this.replaceSlot(characterId, record);
            this.sendState(session, characterId);
          });
        },
        (cause: unknown) => {
          this.pendingSlotCharges.delete(chargeKey);
          this.warn(characterId, cause);
        },
      ),
    );
  }

  private optionFor(slot: TaskSlotRecord) {
    if (slot.selectedRaceId === null) return undefined;
    const entry = this.catalog.entriesByRaceId.get(slot.selectedRaceId);
    if (!entry) return undefined;
    return taskHuntingOptionFor(entry.stars, slot.rarity);
  }

  private upgradeUnlocked(characterId: string, entry: PoolEntry): boolean {
    const kills = this.bestiaryKillsFor(characterId).get(entry.raceId) ?? 0;
    return kills >= entry.toKill;
  }

  private freshSlots(
    level: number,
    premium: boolean,
    now: number,
  ): TaskSlotRecord[] {
    const freeRerollAtMs = now + TASK_HUNTING_RULES.freeRerollSeconds * 1000;
    const slots: TaskSlotRecord[] = [];
    const blackList = new Set<number>();
    for (let index = 0; index < TASK_HUNTING_RULES.slotCount; index += 1) {
      const unlocked = index === 0 || (index === 1 && premium);
      const grid = unlocked
        ? rollMonsterGrid(this.pool, blackList, level, this.rng)
        : [];
      for (const raceId of grid) blackList.add(raceId);
      slots.push({
        slot: index,
        state: unlocked ? "selection" : "locked",
        grid,
        selectedRaceId: null,
        upgrade: false,
        rarity: 1,
        kills: 0,
        disabledUntilMs: 0,
        freeRerollAtMs,
      });
    }
    return slots;
  }

  /** Canary getTaskHuntingBlackList: selection OR grid, per slot. */
  private rollGrid(
    slots: ReadonlyArray<TaskSlotRecord>,
    level: number,
  ): number[] {
    const blackList = new Set<number>();
    for (const slot of slots) {
      if (slot.selectedRaceId !== null) {
        blackList.add(slot.selectedRaceId);
        continue;
      }
      for (const raceId of slot.grid) blackList.add(raceId);
    }
    return rollMonsterGrid(this.pool, blackList, level, this.rng);
  }

  private erasedTask(slot: TaskSlotRecord): TaskSlotRecord {
    return {
      ...slot,
      upgrade: false,
      state: "selection",
      selectedRaceId: null,
      kills: 0,
      rarity: 1,
    };
  }

  private replaceSlot(characterId: string, record: TaskSlotRecord): void {
    const slots = this.slotsByCharacter.get(characterId);
    if (!slots) return;
    const index = slots.findIndex((slot) => slot.slot === record.slot);
    if (index >= 0) slots[index] = record;
  }

  private persistSlot(characterId: string, record: TaskSlotRecord): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store
        .saveSlot(characterId, record)
        .catch((cause: unknown) => this.warn(characterId, cause)),
    );
  }

  private sendState(session: Session, characterId: string): void {
    const slots = this.slotsByCharacter.get(characterId);
    const player = this.world.getPlayer(characterId);
    if (!slots || !player) return;
    const now = this.clockNow;
    const anyListSelection = slots.some(
      (slot) => slot.state === "list-selection",
    );
    const message: TaskHuntingStateMessage = {
      type: "hunting-tasks-state",
      slots: slots.map((slot) => this.projectSlot(characterId, slot, now)),
      taskPoints: this.taskPointsByCharacter.get(characterId) ?? 0,
      rerollPriceGold: player.level * TASK_HUNTING_RULES.rerollPricePerLevel,
      listSelectionPool: anyListSelection
        ? this.pool.map((entry) => this.projectMonster(characterId, entry))
        : null,
    };
    session.send(message);
  }

  private projectSlot(
    characterId: string,
    slot: TaskSlotRecord,
    now: number,
  ): TaskHuntingSlot {
    const option = this.optionFor(slot);
    return {
      slot: slot.slot,
      state: slot.state,
      unlock:
        slot.state === "locked" ? (slot.slot === 1 ? "premium" : "store") : null,
      grid: slot.grid.flatMap((raceId) => {
        const entry = this.pool.find(
          (candidate) => candidate.raceId === raceId,
        );
        return entry ? [this.projectMonster(characterId, entry)] : [];
      }),
      selected: this.projectSelected(characterId, slot),
      upgrade: slot.upgrade,
      rarity: slot.rarity,
      kills: slot.kills,
      goalKills: option
        ? slot.upgrade
          ? option.secondKills
          : option.firstKills
        : null,
      goalPoints: option
        ? slot.upgrade
          ? option.secondReward
          : option.firstReward
        : null,
      disabledForSeconds: Math.max(
        0,
        Math.ceil((slot.disabledUntilMs - now) / 1000),
      ),
      freeRerollInSeconds: Math.max(
        0,
        Math.ceil((slot.freeRerollAtMs - now) / 1000),
      ),
    };
  }

  private projectSelected(
    characterId: string,
    slot: TaskSlotRecord,
  ): TaskHuntingSlot["selected"] {
    if (slot.selectedRaceId === null) return null;
    const entry = this.pool.find(
      (candidate) => candidate.raceId === slot.selectedRaceId,
    );
    if (!entry) return null;
    return this.projectMonster(characterId, entry);
  }

  private projectMonster(characterId: string, entry: PoolEntry) {
    return {
      raceId: entry.raceId,
      name: entry.name,
      lookTypeId: entry.lookTypeId,
      stars: Math.min(5, entry.stars),
      upgradeUnlocked: this.upgradeUnlocked(characterId, entry),
    };
  }

  private fail(
    session: Session,
    reason: TaskHuntingActionFailedReason,
  ): void {
    session.send({ type: "hunting-task-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`hunting task operation failed (${context}): ${reason}`);
  }
}
