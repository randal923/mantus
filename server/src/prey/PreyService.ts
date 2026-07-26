import {
  PREY_LIMITS,
  PREY_RULES,
  type PreyActionFailedReason,
  type PreyActionMessage,
  type PreyBonusType,
  type PreySlot,
  type PreyStateMessage,
} from "@tibia/protocol";
import type { WorldActionRng } from "../action/WorldActionRng";
import type { BestiaryCatalog } from "../bestiary/BestiaryCatalog";
import type { Monster } from "../creature/Monster";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { PreyHooks } from "./PreyHooks";
import type { PreySlotRecord, PreyStore } from "./PreyStore";
import {
  preyBonusPercentageFor,
  rollBonusRarity,
  rollBonusType,
} from "./preyBonusRoll";
import { rollMonsterGrid, type GridCandidate } from "./rollMonsterGrid";

interface PoolEntry extends GridCandidate {
  readonly name: string;
  readonly lookTypeId: number;
}

/**
 * The prey system (Feature 74), transcribed from pinned Canary ioprey.cpp.
 *
 * Slot state for online characters lives in memory, loads once at attach,
 * and mutates only inside the tick (charter rules 3/5). Combat and death
 * hooks read that live state at execution time — never a value cached at
 * intent enqueue (rule 4). Gold and wildcard spends are decided here but
 * performed by the store in one ACID transaction with the ledger/audit rows
 * and the slot row they pay for; memory is updated only from the committed
 * outcome, so a failed debit never leaves a rolled slot behind (rule 2/11).
 *
 * Hunting time drains in Canary's 60/120 s chunks on kill-experience gains
 * (an AFK player's prey never expires). Expiry renewals under the
 * auto-reroll/lock options apply optimistically inside the tick and are
 * corrected (bonus erased, wildcard restored) if the durable debit reports
 * insufficient funds.
 */
export class PreyService implements PreyHooks {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly slotsByCharacter = new Map<string, PreySlotRecord[]>();
  private readonly wildcardsByCharacter = new Map<string, number>();
  /** Canary's NextUseStaminaTime checkpoint, epoch seconds; 1 = fresh. */
  private readonly drainCheckpointAt = new Map<string, number>();
  /** Slots with an economy transaction in flight; blocks a second one. */
  private readonly pendingSlotCharges = new Set<string>();
  /** Server clock as of the last public entry point; drives projections. */
  private clockNow = 0;
  private readonly pool: ReadonlyArray<PoolEntry>;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly catalog: BestiaryCatalog,
    private readonly rng: WorldActionRng,
    private readonly store?: PreyStore,
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
      });
    }
    this.pool = pool.sort((a, b) => a.name.localeCompare(b.name));
  }

  applyResolvedOutcomes(now: number): void {
    this.clockNow = now;
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  detachCharacter(characterId: string): void {
    this.slotsByCharacter.delete(characterId);
    this.wildcardsByCharacter.delete(characterId);
    this.drainCheckpointAt.delete(characterId);
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store.load(characterId).then(
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
              this.wildcardsByCharacter.set(characterId, 0);
              this.drainCheckpointAt.set(characterId, 1);
              this.track(
                store
                  .initialize(characterId, slots)
                  .catch((cause: unknown) => this.warn(characterId, cause)),
              );
              this.sendState(session, characterId);
              return;
            }
            const slots = snapshot.slots.map((record) => ({ ...record }));
            // Canary load rule: slot two unlocks the first time the
            // character loads while premium, and is never re-locked.
            const second = slots[1];
            if (
              second &&
              second.state === "locked" &&
              player.isPremiumAt(now)
            ) {
              slots[1] = {
                ...second,
                state: "selection",
                grid: this.rollGrid(slots, player.level),
                freeRerollAtMs: now + PREY_RULES.freeRerollSeconds * 1000,
              };
              this.persistSlot(characterId, slots[1]);
            }
            this.slotsByCharacter.set(characterId, slots);
            this.wildcardsByCharacter.set(characterId, snapshot.wildcards);
            this.drainCheckpointAt.set(characterId, 1);
            this.sendState(session, characterId);
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  handle(session: Session, intent: PreyActionMessage, now: number): void {
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
    this.cooldownBySession.set(session.id, now + PREY_LIMITS.actionCooldownMs);
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
      case "bonus-reroll":
        this.bonusReroll(session, characterId, slot);
        return;
      case "select-monster":
        this.selectMonster(session, characterId, slots, slot, intent.index);
        return;
      case "wildcard-list":
        this.wildcardList(session, characterId, slot);
        return;
      case "wildcard-select":
        this.wildcardSelect(session, characterId, slots, slot, intent.raceId);
        return;
      case "set-option":
        this.setOption(session, characterId, slot, intent.option);
        return;
    }
  }

  // ---------------------------------------------------------------- hooks

  damageBoostPercent(attackerId: string, monster: Monster): number {
    return this.activeBonusPercent(attackerId, monster, "damage");
  }

  damageReductionPercent(defenderId: string, monster: Monster): number {
    return this.activeBonusPercent(defenderId, monster, "defense");
  }

  experienceBonusPercent(recipientId: string, monster: Monster): number {
    return this.activeBonusPercent(recipientId, monster, "experience");
  }

  improvedLootPercent(killerId: string, monster: Monster): number {
    return this.activeBonusPercent(killerId, monster, "loot");
  }

  /**
   * Canary's stamina-checkpoint drain (data/events/scripts/player.lua:99-136):
   * each kill-experience gain past the checkpoint drains 60 s (or 120 s when
   * more than a minute passed) of every occupied slot's hunting time.
   */
  onHuntExperienceGained(recipientId: string, now: number): void {
    this.clockNow = now;
    const slots = this.slotsByCharacter.get(recipientId);
    if (!slots) return;
    const nowSeconds = Math.floor(now / 1000);
    const checkpoint = this.drainCheckpointAt.get(recipientId) ?? 1;
    const timePassed = nowSeconds - checkpoint;
    if (timePassed <= 0) return;
    const amount = timePassed > 60 ? 120 : 60;
    this.drainCheckpointAt.set(recipientId, nowSeconds + amount);
    let changed = false;
    for (const slot of slots) {
      if (
        slot.state !== "active" ||
        slot.selectedRaceId === null ||
        slot.bonusTimeLeftSeconds <= 0
      ) {
        continue;
      }
      changed = true;
      if (slot.bonusTimeLeftSeconds > amount) {
        this.replaceSlot(recipientId, slots, {
          ...slot,
          bonusTimeLeftSeconds: slot.bonusTimeLeftSeconds - amount,
        });
        continue;
      }
      this.expireSlot(recipientId, slots, slot);
    }
    if (!changed) return;
    const session = this.registry.sessionFor(recipientId);
    if (session) this.sendState(session, recipientId);
  }

  /** Store/daily-reward integration point; capped like Canary's store path. */
  grantWildcards(characterId: string, amount: number): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store.grantWildcards(characterId, amount, PREY_RULES.maxWildcards).then(
        (result) => {
          this.outcomes.push(() => {
            if (!this.slotsByCharacter.has(characterId)) return;
            this.wildcardsByCharacter.set(characterId, result.wildcardsAfter);
            const session = this.registry.sessionFor(characterId);
            if (session) this.sendState(session, characterId);
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  // -------------------------------------------------------------- actions

  private listReroll(
    session: Session,
    characterId: string,
    level: number,
    slots: PreySlotRecord[],
    slot: PreySlotRecord,
    now: number,
  ): void {
    const free = slot.freeRerollAtMs <= now;
    const rerolled: PreySlotRecord = {
      ...this.eraseBonus(slot, true),
      state:
        slot.bonusType !== null ? "selection-change-monster" : "selection",
      grid: this.rollGrid(slots, level),
      freeRerollAtMs: free
        ? now + PREY_RULES.freeRerollSeconds * 1000
        : slot.freeRerollAtMs,
    };
    if (free) {
      this.replaceSlot(characterId, slots, rerolled);
      this.persistSlot(characterId, rerolled);
      this.sendState(session, characterId);
      return;
    }
    const price = level * PREY_RULES.listRerollPricePerLevel;
    this.chargeGold(session, characterId, rerolled, price);
  }

  private bonusReroll(
    session: Session,
    characterId: string,
    slot: PreySlotRecord,
  ): void {
    if (!this.isOccupied(slot)) {
      this.fail(session, "not-selectable");
      return;
    }
    if ((this.wildcardsByCharacter.get(characterId) ?? 0) < PREY_RULES.bonusRerollPrice) {
      this.fail(session, "insufficient-wildcards");
      return;
    }
    const rerolled = this.withFreshBonus(slot);
    this.chargeWildcards(
      session,
      characterId,
      rerolled,
      PREY_RULES.bonusRerollPrice,
      "prey-bonus-reroll",
    );
  }

  private selectMonster(
    session: Session,
    characterId: string,
    slots: PreySlotRecord[],
    slot: PreySlotRecord,
    index: number | undefined,
  ): void {
    if (this.isOccupied(slot)) {
      this.fail(session, "already-active");
      return;
    }
    if (
      index === undefined ||
      !this.canSelect(slot) ||
      index >= slot.grid.length
    ) {
      this.fail(session, "invalid-request");
      return;
    }
    const raceId = slot.grid[index];
    if (raceId === undefined) {
      this.fail(session, "invalid-request");
      return;
    }
    this.activate(session, characterId, slots, slot, raceId);
  }

  private wildcardList(
    session: Session,
    characterId: string,
    slot: PreySlotRecord,
  ): void {
    if ((this.wildcardsByCharacter.get(characterId) ?? 0) < PREY_RULES.wildcardListPrice) {
      this.fail(session, "insufficient-wildcards");
      return;
    }
    // Opening the full list cancels any active prey (Canary :327-329).
    const listed: PreySlotRecord = {
      ...slot,
      state: "list-selection",
      selectedRaceId: null,
      bonusTimeLeftSeconds: 0,
    };
    this.chargeWildcards(
      session,
      characterId,
      listed,
      PREY_RULES.wildcardListPrice,
      "prey-wildcard-list",
    );
  }

  private wildcardSelect(
    session: Session,
    characterId: string,
    slots: PreySlotRecord[],
    slot: PreySlotRecord,
    raceId: number | undefined,
  ): void {
    if (this.isOccupied(slot)) {
      this.fail(session, "already-active");
      return;
    }
    if (raceId === undefined || slot.state !== "list-selection") {
      this.fail(session, "invalid-request");
      return;
    }
    // The full list allows prey-exclusive races but never an unknown id
    // (Canary quirk fixed deliberately: an unresolvable raceId is rejected).
    if (!this.pool.some((entry) => entry.raceId === raceId)) {
      this.fail(session, "not-selectable");
      return;
    }
    this.activate(session, characterId, slots, slot, raceId);
  }

  private setOption(
    session: Session,
    characterId: string,
    slot: PreySlotRecord,
    option: PreyActionMessage["option"],
  ): void {
    if (option === undefined) {
      this.fail(session, "invalid-request");
      return;
    }
    const wildcards = this.wildcardsByCharacter.get(characterId) ?? 0;
    if (option === "auto-reroll" && wildcards < PREY_RULES.autoRerollPrice) {
      this.fail(session, "insufficient-wildcards");
      return;
    }
    if (option === "lock" && wildcards < PREY_RULES.lockPrice) {
      this.fail(session, "insufficient-wildcards");
      return;
    }
    const updated: PreySlotRecord = { ...slot, option };
    this.replaceSlot(characterId, this.slotsByCharacter.get(characterId) ?? [], updated);
    this.persistSlot(characterId, updated);
    this.sendState(session, characterId);
  }

  private activate(
    session: Session,
    characterId: string,
    slots: PreySlotRecord[],
    slot: PreySlotRecord,
    raceId: number,
  ): void {
    const duplicate = slots.some(
      (other) =>
        other.slot !== slot.slot &&
        other.selectedRaceId === raceId &&
        other.bonusTimeLeftSeconds > 0,
    );
    if (duplicate) {
      this.fail(session, "duplicate-race");
      return;
    }
    const withBonus =
      slot.bonusType === null ? this.withFreshBonus(slot) : slot;
    const activated: PreySlotRecord = {
      ...withBonus,
      state: "active",
      selectedRaceId: raceId,
      grid: slot.grid.filter((id) => id !== raceId),
      bonusTimeLeftSeconds: PREY_RULES.bonusTimeSeconds,
    };
    this.replaceSlot(characterId, slots, activated);
    this.persistSlot(characterId, activated);
    this.sendState(session, characterId);
  }

  // ------------------------------------------------------------- plumbing

  /** Type first (against the pre-roll rarity), then rarity, then percent. */
  private withFreshBonus(slot: PreySlotRecord): PreySlotRecord {
    const type = rollBonusType(slot.bonusType, slot.bonusRarity, this.rng);
    const rarity = rollBonusRarity(slot.bonusRarity, this.rng);
    return {
      ...slot,
      bonusType: type,
      bonusRarity: rarity,
      bonusPercentage: preyBonusPercentageFor(type, rarity),
      bonusTimeLeftSeconds: PREY_RULES.bonusTimeSeconds,
    };
  }

  private expireSlot(
    characterId: string,
    slots: PreySlotRecord[],
    slot: PreySlotRecord,
  ): void {
    const wildcards = this.wildcardsByCharacter.get(characterId) ?? 0;
    if (
      slot.option === "auto-reroll" &&
      wildcards >= PREY_RULES.autoRerollPrice
    ) {
      const renewed = this.withFreshBonus(slot);
      this.renewOptimistically(
        characterId,
        slots,
        renewed,
        PREY_RULES.autoRerollPrice,
      );
      return;
    }
    if (slot.option === "lock" && wildcards >= PREY_RULES.lockPrice) {
      const renewed: PreySlotRecord = {
        ...slot,
        bonusTimeLeftSeconds: PREY_RULES.bonusTimeSeconds,
      };
      this.renewOptimistically(characterId, slots, renewed, PREY_RULES.lockPrice);
      return;
    }
    // Plain expiry regenerates the grid; a failed option keeps the old one
    // (Canary :284-290).
    const player = this.world.getPlayer(characterId);
    const expired: PreySlotRecord = {
      ...this.eraseBonus(slot, false),
      grid:
        slot.option === "none" && player
          ? this.rollGrid(slots, player.level)
          : slot.grid,
    };
    this.replaceSlot(characterId, slots, expired);
    this.persistSlot(characterId, expired);
  }

  /**
   * Expiry renewal: memory pays now, the store debits asynchronously; an
   * insufficient-funds report erases the bonus and restores the wildcards.
   */
  private renewOptimistically(
    characterId: string,
    slots: PreySlotRecord[],
    renewed: PreySlotRecord,
    cost: number,
  ): void {
    const store = this.store;
    const balance = this.wildcardsByCharacter.get(characterId) ?? 0;
    this.wildcardsByCharacter.set(characterId, balance - cost);
    this.replaceSlot(characterId, slots, renewed);
    if (!store) return;
    this.track(
      store
        .spendWildcards(characterId, cost, "prey-option-charge", renewed)
        .then(
          (result) => {
            if (result.status === "committed") return;
            this.outcomes.push(() => {
              const current = this.slotsByCharacter.get(characterId);
              const stale = current?.[renewed.slot];
              if (!current || !stale) return;
              this.wildcardsByCharacter.set(
                characterId,
                (this.wildcardsByCharacter.get(characterId) ?? 0) + cost,
              );
              const corrected = this.eraseBonus(stale, false);
              this.replaceSlot(characterId, current, corrected);
              this.persistSlot(characterId, corrected);
              const session = this.registry.sessionFor(characterId);
              if (session) this.sendState(session, characterId);
            });
          },
          (cause: unknown) => this.warn(characterId, cause),
        ),
    );
  }

  private chargeGold(
    session: Session,
    characterId: string,
    record: PreySlotRecord,
    price: number,
  ): void {
    const store = this.store;
    if (!store) return;
    const chargeKey = `${characterId}:${record.slot}`;
    this.pendingSlotCharges.add(chargeKey);
    this.track(
      store.chargeListReroll(characterId, price, record).then(
        (result) => {
          this.outcomes.push(() => {
            this.pendingSlotCharges.delete(chargeKey);
            if (this.registry.sessionFor(characterId) !== session) return;
            if (result.status !== "committed") {
              this.fail(session, "insufficient-gold");
              return;
            }
            const slots = this.slotsByCharacter.get(characterId);
            if (slots) this.replaceSlot(characterId, slots, record);
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
    record: PreySlotRecord,
    cost: number,
    event: "prey-bonus-reroll" | "prey-wildcard-list",
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
            const slots = this.slotsByCharacter.get(characterId);
            if (slots) this.replaceSlot(characterId, slots, record);
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

  private activeBonusPercent(
    characterId: string,
    monster: Monster,
    type: PreyBonusType,
  ): number {
    const raceId = this.catalog.raceIdByMonsterTypeId.get(monster.type.id);
    if (raceId === undefined) return 0;
    const slot = this.slotsByCharacter
      .get(characterId)
      ?.find(
        (candidate) =>
          candidate.state === "active" &&
          candidate.selectedRaceId === raceId &&
          candidate.bonusTimeLeftSeconds > 0,
      );
    if (!slot || slot.bonusType !== type) return 0;
    return slot.bonusPercentage;
  }

  private freshSlots(
    level: number,
    premium: boolean,
    now: number,
  ): PreySlotRecord[] {
    const freeRerollAtMs = now + PREY_RULES.freeRerollSeconds * 1000;
    const base: Omit<PreySlotRecord, "slot" | "state" | "grid"> = {
      selectedRaceId: null,
      bonusType: null,
      bonusRarity: 1,
      bonusPercentage: 5,
      bonusTimeLeftSeconds: 0,
      freeRerollAtMs,
      option: "none",
    };
    const slots: PreySlotRecord[] = [];
    const blackList = new Set<number>();
    for (let index = 0; index < PREY_RULES.slotCount; index += 1) {
      const unlocked = index === 0 || (index === 1 && premium);
      const grid = unlocked
        ? rollMonsterGrid(this.pool, blackList, level, this.rng)
        : [];
      for (const raceId of grid) blackList.add(raceId);
      slots.push({
        ...base,
        slot: index,
        state: unlocked ? "selection" : "locked",
        grid,
      });
    }
    return slots;
  }

  private rollGrid(slots: ReadonlyArray<PreySlotRecord>, level: number): number[] {
    // Canary getPreyBlackList: active selections plus every slot's grid.
    const blackList = new Set<number>();
    for (const slot of slots) {
      if (this.isOccupied(slot) && slot.selectedRaceId !== null) {
        blackList.add(slot.selectedRaceId);
      }
      for (const raceId of slot.grid) blackList.add(raceId);
    }
    return rollMonsterGrid(this.pool, blackList, level, this.rng);
  }

  private eraseBonus(
    slot: PreySlotRecord,
    maintainBonus: boolean,
  ): PreySlotRecord {
    return {
      ...slot,
      state: "selection",
      option: "none",
      selectedRaceId: null,
      bonusTimeLeftSeconds: 0,
      ...(maintainBonus
        ? {}
        : { bonusType: null, bonusRarity: 1, bonusPercentage: 5 }),
    };
  }

  private isOccupied(slot: PreySlotRecord): boolean {
    return slot.selectedRaceId !== null && slot.bonusTimeLeftSeconds > 0;
  }

  private canSelect(slot: PreySlotRecord): boolean {
    return (
      slot.state === "selection" ||
      slot.state === "selection-change-monster" ||
      slot.state === "list-selection" ||
      slot.state === "inactive"
    );
  }

  private replaceSlot(
    characterId: string,
    slots: PreySlotRecord[],
    record: PreySlotRecord,
  ): void {
    const stored = this.slotsByCharacter.get(characterId);
    const target = stored ?? slots;
    const index = target.findIndex((slot) => slot.slot === record.slot);
    if (index >= 0) target[index] = record;
  }

  private persistSlot(characterId: string, record: PreySlotRecord): void {
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
    const message: PreyStateMessage = {
      type: "prey-state",
      slots: slots.map((slot) => this.projectSlot(slot, now)),
      wildcards: this.wildcardsByCharacter.get(characterId) ?? 0,
      listRerollPriceGold:
        player.level * PREY_RULES.listRerollPricePerLevel,
      listSelectionPool: anyListSelection
        ? this.pool.map((entry) => ({
            raceId: entry.raceId,
            name: entry.name,
            lookTypeId: entry.lookTypeId,
          }))
        : null,
    };
    session.send(message);
  }

  private projectSlot(slot: PreySlotRecord, now: number): PreySlot {
    return {
      slot: slot.slot,
      state: slot.state,
      unlock:
        slot.state === "locked" ? (slot.slot === 1 ? "premium" : "store") : null,
      grid: slot.grid.flatMap((raceId) => {
        const entry = this.catalog.entriesByRaceId.get(raceId);
        if (!entry) return [];
        return [
          {
            raceId,
            name: entry.monsterType.name,
            lookTypeId: entry.monsterType.outfit.lookType,
          },
        ];
      }),
      selected: this.projectSelected(slot),
      bonus:
        slot.bonusType === null
          ? null
          : {
              type: slot.bonusType,
              rarity: slot.bonusRarity,
              percentage: slot.bonusPercentage,
            },
      bonusTimeLeftSeconds: slot.bonusTimeLeftSeconds,
      freeRerollInSeconds: Math.max(
        0,
        Math.ceil((slot.freeRerollAtMs - now) / 1000),
      ),
      option: slot.option,
    };
  }

  private projectSelected(slot: PreySlotRecord): PreySlot["selected"] {
    if (slot.selectedRaceId === null) return null;
    const entry = this.catalog.entriesByRaceId.get(slot.selectedRaceId);
    if (!entry) return null;
    return {
      raceId: slot.selectedRaceId,
      name: entry.monsterType.name,
      lookTypeId: entry.monsterType.outfit.lookType,
    };
  }

  private fail(session: Session, reason: PreyActionFailedReason): void {
    session.send({ type: "prey-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`prey operation failed (${context}): ${reason}`);
  }
}
