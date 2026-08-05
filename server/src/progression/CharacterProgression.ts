import {
  DAILY_REWARD_RULES,
  MAX_MAGIC_LEVEL,
  MAX_PROGRESSION_VALUE,
  MAX_SKILL_LEVEL,
  MAX_STAMINA_MINUTES,
  MIN_SKILL_LEVEL,
  SKILLS,
  type AccountTier,
  type CharacterVocation,
  type Skill,
} from "@tibia/protocol";
import {
  decayHuntStamina,
  getStaminaExperienceMultiplier,
  regenerateOfflineStamina,
  regenerateRestingStamina,
} from "./staminaRules";
import type { CharacterSkill } from "./CharacterSkill";
import {
  deriveCharacterStats,
  type DerivedStatModifier,
} from "./deriveCharacterStats";
import {
  EMPTY_SKILL_BONUSES,
  sameSkillBonuses,
  type EquipmentSkillBonuses,
} from "./EquipmentSkillBonuses";
import { getExperienceForLevel } from "./getExperienceForLevel";
import { getLevelForExperience } from "./getLevelForExperience";
import { getAccountRegeneration } from "./getAccountRegeneration";
import { getManaForNextMagicLevel } from "./getManaForNextMagicLevel";
import { getSkillTriesForNextLevel } from "./getSkillTriesForNextLevel";
import { getVocation } from "./getVocation";
import type { ProgressionEvent, ProgressionEventType } from "./ProgressionEvent";
import type { Vocation } from "./Vocation";

const MAX_AWARD_AMOUNT = 1_000_000_000;
/**
 * How many durably-committed progression events to keep in memory past the
 * commit boundary. Event ids never recur, so this is a defense-in-depth window
 * that bounds `sessionEvents`/`processedEventIds` growth over a long session.
 */
export const RETAINED_MEMORY_EVENTS = 256;
/**
 * A player who steps into a protection zone waits a full interval before the
 * first rested stamina-minute, so hopping in and out cannot farm it.
 */
const RESTING_STAMINA_FIRST_INTERVAL_MS = 180_000;
const MAX_SCHEDULES = 4;
const MIN_TRAINING_INTERVAL_MS = 250;
const MAX_SCHEDULE_TICKS_PER_SERVER_TICK = 5;
const EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
/**
 * A qualifying kill arms soul regeneration for this long (Canary's 4-minute
 * CONDITION_SOUL). Soul only regenerates while the window is open and the
 * player is outside a protection zone.
 */
export const SOUL_ELIGIBILITY_MS = 4 * 60 * 1_000;

interface ProgressionMutation {
  readonly processed: boolean;
  readonly changed: boolean;
}

interface ProgressionTick {
  readonly changed: boolean;
  readonly healthGain: number;
}

interface TrainingSchedule {
  readonly id: string;
  readonly skill: Skill;
  readonly intervalMs: number;
  readonly tries: number;
  nextAt: number;
}

interface DueTicks {
  readonly count: number;
  readonly nextAt: number;
}

export class CharacterProgression {
  private currentVocation: CharacterVocation;
  private currentLevel: number;
  private currentExperience: bigint;
  private currentMagicLevel: number;
  private currentManaSpent: number;
  private currentMana: number;
  private currentSoul: number;
  private currentStamina: number;
  /** Seeded at 0 so the first hunt after login costs two stamina (Canary). */
  private nextStaminaDecayAt = 0;
  /** Zero while the resting-stamina bonus is not running; see tickRestingStamina. */
  private nextRestingStaminaAt = 0;
  /** Soul regenerates only while `now` is before this armed-by-kill deadline. */
  private soulEligibleUntil = 0;
  private readonly skillStates = new Map<Skill, CharacterSkill>();
  private readonly processedEventIds: Set<string>;
  private readonly sessionEvents: ProgressionEvent[] = [];
  /** Count of `sessionEvents` already handed to a snapshot (reserved). */
  private reservedEventCount = 0;
  /** Count of reserved events whose snapshot is now durable (committed). */
  private committedEventCount = 0;
  private readonly trainingSchedules = new Map<string, TrainingSchedule>();
  private nextHealthAt: number;
  private nextManaAt: number;
  private nextSoulAt: number;
  private accountTier: AccountTier;
  private regeneration: ReturnType<typeof getAccountRegeneration>;
  private wheelModifier: DerivedStatModifier;
  private equipmentModifier: DerivedStatModifier = {};
  private equipmentAttackSpeedPercent = 0;
  /**
   * Skill and magic-level deltas from equipped gear. Display-only bookkeeping
   * for the character panel: combat re-reads the equipment itself at execution
   * time, so nothing here is ever an input to a formula.
   */
  private equipmentSkillBonuses: EquipmentSkillBonuses = EMPTY_SKILL_BONUSES;
  private cachedStats: {
    vocation: CharacterVocation;
    level: number;
    wheel: DerivedStatModifier;
    equipment: DerivedStatModifier;
    value: ReturnType<typeof deriveCharacterStats>;
  } | null = null;

  constructor(
    vocation: CharacterVocation,
    readonly definitionVersion: number,
    accountTier: AccountTier,
    state: {
      level: number;
      experience: bigint;
      magicLevel: number;
      manaSpent: number;
      mana: number;
      soul: number;
      stamina: number;
      /** Real seconds since this character was last persisted (offline span). */
      offlineSeconds: number;
      skills: ReadonlyArray<CharacterSkill>;
      processedEventIds: ReadonlyArray<string>;
    },
    now: number,
    wheelModifier: DerivedStatModifier = {},
    equipmentModifier: DerivedStatModifier = {},
  ) {
    this.currentVocation = vocation;
    this.wheelModifier = wheelModifier;
    // Seeded at login from the loaded inventory (affix max HP/mana), so the
    // constructor's health clamp never eats equipment-granted health.
    this.equipmentModifier = equipmentModifier;
    const definition = getVocation(vocation, definitionVersion);
    this.accountTier = accountTier;
    this.regeneration = getAccountRegeneration(
      vocation,
      definitionVersion,
      accountTier,
    );
    if (
      state.experience < 0n ||
      getLevelForExperience(state.experience) !== state.level
    ) {
      throw new Error("persisted experience and level are inconsistent");
    }
    if (
      !Number.isInteger(state.magicLevel) ||
      state.magicLevel < 0 ||
      state.magicLevel > MAX_MAGIC_LEVEL
    ) {
      throw new Error("persisted magic level is out of range");
    }
    const manaForNext = getManaForNextMagicLevel(
      definition,
      state.magicLevel,
    );
    if (
      !Number.isSafeInteger(state.manaSpent) ||
      state.manaSpent < 0 ||
      (manaForNext > 0 && state.manaSpent >= manaForNext) ||
      (manaForNext === 0 && state.manaSpent !== 0)
    ) {
      throw new Error("persisted magic progress is out of range");
    }
    const stats = deriveCharacterStats({
      vocation,
      definitionVersion,
      level: state.level,
      wheel: wheelModifier,
    });
    if (!Number.isInteger(state.mana) || state.mana < 0) {
      throw new Error("persisted mana is out of range");
    }
    // Clamp instead of rejecting: wheel slices persist outside the character
    // row, so a crash between the two writes may leave mana above the
    // currently-derivable maximum.
    state = { ...state, mana: Math.min(state.mana, stats.maxMana) };
    if (
      !Number.isInteger(state.soul) ||
      state.soul < 0 ||
      state.soul > definition.maxSoul
    ) {
      throw new Error("persisted soul is out of range");
    }
    if (
      !Number.isInteger(state.stamina) ||
      state.stamina < 0 ||
      state.stamina > MAX_STAMINA_MINUTES
    ) {
      throw new Error("persisted stamina is out of range");
    }
    if (state.skills.length !== SKILLS.length) {
      throw new Error("persisted skill set is incomplete");
    }
    for (const skill of state.skills) {
      if (this.skillStates.has(skill.skill)) {
        throw new Error(`persisted skill ${skill.skill} is duplicated`);
      }
      if (
        !Number.isInteger(skill.level) ||
        skill.level < MIN_SKILL_LEVEL ||
        skill.level > MAX_SKILL_LEVEL
      ) {
        throw new Error(`persisted skill ${skill.skill} level is out of range`);
      }
      const required = getSkillTriesForNextLevel(
        definition,
        skill.skill,
        skill.level,
      );
      if (
        !Number.isSafeInteger(skill.tries) ||
        skill.tries < 0 ||
        (required > 0 && skill.tries >= required) ||
        (required === 0 && skill.tries !== 0)
      ) {
        throw new Error(
          `persisted skill ${skill.skill} progress is out of range`,
        );
      }
      this.skillStates.set(skill.skill, { ...skill });
    }
    for (const skill of SKILLS) {
      if (!this.skillStates.has(skill)) {
        throw new Error(`persisted skill ${skill} is missing`);
      }
    }
    for (const eventId of state.processedEventIds) {
      this.assertEventId(eventId);
    }
    if (new Set(state.processedEventIds).size !== state.processedEventIds.length) {
      throw new Error("persisted progression event ids are duplicated");
    }
    this.currentLevel = state.level;
    this.currentExperience = state.experience;
    this.currentMagicLevel = state.magicLevel;
    this.currentManaSpent = state.manaSpent;
    this.currentMana = state.mana;
    this.currentSoul = state.soul;
    // Offline regeneration is applied once, at load, from the durable span
    // between the last save and now. A too-short reconnect regenerates nothing,
    // so a client cannot manufacture stamina by relogging (charter rule 8).
    this.currentStamina = regenerateOfflineStamina(
      state.stamina,
      state.offlineSeconds,
    );
    this.processedEventIds = new Set(state.processedEventIds);
    this.nextHealthAt = now + this.regeneration.healthIntervalMs;
    this.nextManaAt = now + this.regeneration.manaIntervalMs;
    this.nextSoulAt = now + this.regeneration.soulIntervalMs;
  }

  get level(): number {
    return this.currentLevel;
  }

  get vocation(): CharacterVocation {
    return this.currentVocation;
  }

  promote(vocation: CharacterVocation, now: number): void {
    const current = getVocation(this.currentVocation, this.definitionVersion);
    if (current.promotedVocation !== vocation) {
      throw new Error("vocation promotion is invalid");
    }
    this.currentVocation = vocation;
    this.regeneration = getAccountRegeneration(
      vocation,
      this.definitionVersion,
      this.accountTier,
    );
    this.nextHealthAt = now + this.regeneration.healthIntervalMs;
    this.nextManaAt = now + this.regeneration.manaIntervalMs;
    this.nextSoulAt = now + this.regeneration.soulIntervalMs;
  }

  get experience(): bigint {
    return this.currentExperience;
  }

  get magicLevel(): number {
    return this.currentMagicLevel;
  }

  get manaSpent(): number {
    return this.currentManaSpent;
  }

  get mana(): number {
    return this.currentMana;
  }

  get maxMana(): number {
    return this.stats.maxMana;
  }

  get maxHealth(): number {
    return this.stats.maxHealth;
  }

  get capacity(): number {
    return this.stats.capacity;
  }

  get speed(): number {
    return this.stats.speed;
  }

  get soul(): number {
    return this.currentSoul;
  }

  get maxSoul(): number {
    return getVocation(this.vocation, this.definitionVersion).maxSoul;
  }

  get stamina(): number {
    return this.currentStamina;
  }

  /** Experience multiplier from current stamina (0 / 0.5 / 1 / 1.5). */
  staminaExperienceMultiplier(isPremium: boolean): number {
    return getStaminaExperienceMultiplier(this.currentStamina, isPremium);
  }

  /**
   * Applies one hunting stamina decrement, throttled to at most one per minute
   * of real hunting time. Call once per kill that awarded experience.
   */
  decayHuntStamina(now: number): boolean {
    const result = decayHuntStamina(
      this.currentStamina,
      this.nextStaminaDecayAt,
      now,
    );
    this.nextStaminaDecayAt = result.nextDecayAt;
    if (!result.changed) return false;
    this.currentStamina = result.staminaMinutes;
    return true;
  }

  /** Arms soul regeneration for the next {@link SOUL_ELIGIBILITY_MS}. */
  armSoulRegeneration(now: number): void {
    this.soulEligibleUntil = now + SOUL_ELIGIBILITY_MS;
  }

  get skills(): ReadonlyArray<CharacterSkill> {
    return SKILLS.map((skill) => ({ ...this.requireSkill(skill) }));
  }

  get attackSpeedMs(): number {
    const base = getVocation(
      this.vocation,
      this.definitionVersion,
    ).attackSpeedMs;
    if (this.equipmentAttackSpeedPercent <= 0) return base;
    // Equipment affixes shorten the swing; the floor keeps stacked rolls
    // from ever halving the vocation base.
    return Math.max(
      Math.round(base / 2),
      Math.round(base * (1 - this.equipmentAttackSpeedPercent / 100)),
    );
  }

  /** Display-only companion to `attackSpeedMs`: the equipment delta in ms. */
  get equipmentAttackSpeedBonusMs(): number {
    return (
      this.attackSpeedMs -
      getVocation(this.vocation, this.definitionVersion).attackSpeedMs
    );
  }

  /** Returns whether the stored percent actually changed. */
  setEquipmentAttackSpeedPercent(percent: number): boolean {
    const clamped = Math.max(0, percent);
    if (clamped === this.equipmentAttackSpeedPercent) return false;
    this.equipmentAttackSpeedPercent = clamped;
    return true;
  }

  get sessionProgressionEvents(): ReadonlyArray<ProgressionEvent> {
    return this.sessionEvents;
  }

  /**
   * Returns the events appended since the last reservation and advances the
   * reserve pointer, so pipelined snapshots partition the queue without
   * overlap. Called once per enqueued snapshot inside the tick.
   */
  reserveUnpersistedEvents(): ReadonlyArray<ProgressionEvent> {
    const pending = this.sessionEvents.slice(this.reservedEventCount);
    this.reservedEventCount = this.sessionEvents.length;
    return pending;
  }

  /**
   * Marks `count` reserved events durable and compacts the queue so neither
   * `sessionEvents` nor `processedEventIds` grows without bound. Runs in
   * snapshot-commit order (never ahead of what was reserved). Event ids never
   * recur, so dropping settled ids past the retained window cannot double-award.
   */
  commitPersistedEvents(count: number): void {
    this.committedEventCount = Math.min(
      this.reservedEventCount,
      this.committedEventCount + Math.max(0, count),
    );
    const drop = this.committedEventCount - RETAINED_MEMORY_EVENTS;
    if (drop <= 0) return;
    for (let i = 0; i < drop; i++) {
      this.processedEventIds.delete(this.sessionEvents[i]!.id);
    }
    this.sessionEvents.splice(0, drop);
    this.reservedEventCount -= drop;
    this.committedEventCount -= drop;
  }

  spendMana(amount: number): boolean {
    this.assertResourceAmount(amount);
    if (this.currentMana < amount) return false;
    this.currentMana -= amount;
    return true;
  }

  restoreMana(amount: number): number {
    this.assertResourceAmount(amount);
    const before = this.currentMana;
    this.currentMana = Math.min(this.maxMana, this.currentMana + amount);
    return this.currentMana - before;
  }

  spendSoul(amount: number): boolean {
    this.assertResourceAmount(amount);
    if (this.currentSoul < amount) return false;
    this.currentSoul -= amount;
    return true;
  }

  restoreSoul(amount: number): number {
    this.assertResourceAmount(amount);
    const before = this.currentSoul;
    this.currentSoul = Math.min(this.maxSoul, this.currentSoul + amount);
    return this.currentSoul - before;
  }

  awardExperience(eventId: string, amount: number): ProgressionMutation {
    this.assertAward(eventId, amount);
    if (!this.recordEvent(eventId, "experience")) {
      return { processed: false, changed: false };
    }
    const experience = this.currentExperience + BigInt(Math.floor(amount));
    const level = getLevelForExperience(experience);
    const changed =
      experience !== this.currentExperience || level !== this.currentLevel;
    this.currentExperience = experience;
    if (level !== this.currentLevel) {
      this.currentLevel = level;
      this.currentMana = this.maxMana;
    }
    return { processed: true, changed };
  }

  /**
   * Applies a whole death penalty — experience, magic level, and every skill —
   * under one event id, mirroring Canary's `Player::death`. All three losses
   * use the same fraction and land together or not at all, so a reconnect that
   * replays the death cannot charge one of them twice.
   */
  applyDeathLoss(
    eventId: string,
    percent: number,
  ): {
    processed: boolean;
    lostExperience: bigint;
    lostMagicLevels: number;
    lostSkillLevels: ReadonlyArray<{ skill: Skill; levels: number }>;
  } {
    this.assertEventId(eventId);
    if (!Number.isFinite(percent) || percent < 0 || percent > 1) {
      throw new Error("death loss percent is out of range");
    }
    const none = {
      processed: false,
      lostExperience: 0n,
      lostMagicLevels: 0,
      lostSkillLevels: [],
    };
    if (!this.recordEvent(eventId, "experience")) return none;
    const vocation = getVocation(this.vocation, this.definitionVersion);
    // Scaled integer arithmetic: bigint has no fractional multiply, and the
    // percent carries at most six decimals of resolution.
    const lostExperience =
      (this.currentExperience * BigInt(Math.round(percent * 1_000_000))) /
      1_000_000n;
    if (lostExperience > 0n) {
      this.currentExperience -= lostExperience;
      const level = getLevelForExperience(this.currentExperience);
      if (level !== this.currentLevel) {
        this.currentLevel = level;
        this.currentMana = Math.min(this.currentMana, this.maxMana);
      }
    }
    const magicBefore = this.currentMagicLevel;
    this.applyMagicLoss(vocation, percent);
    const lostSkillLevels: Array<{ skill: Skill; levels: number }> = [];
    for (const skill of SKILLS) {
      const before = this.requireSkill(skill).level;
      this.applySkillLoss(vocation, skill, percent);
      const levels = before - this.requireSkill(skill).level;
      if (levels > 0) lostSkillLevels.push({ skill, levels });
    }
    return {
      processed: true,
      lostExperience,
      lostMagicLevels: magicBefore - this.currentMagicLevel,
      lostSkillLevels,
    };
  }

  /** Canary drains the mana spent toward the current magic level first. */
  private applyMagicLoss(vocation: Vocation, percent: number): void {
    let total = this.currentManaSpent;
    for (let level = 0; level < this.currentMagicLevel; level++) {
      total += getManaForNextMagicLevel(vocation, level);
    }
    let lost = Math.floor(total * percent);
    while (lost > this.currentManaSpent && this.currentMagicLevel > 0) {
      lost -= this.currentManaSpent;
      this.currentMagicLevel -= 1;
      this.currentManaSpent = getManaForNextMagicLevel(
        vocation,
        this.currentMagicLevel,
      );
    }
    this.currentManaSpent = Math.max(0, this.currentManaSpent - lost);
  }

  /** Skills never fall below their starting level (Canary's floor of 10). */
  private applySkillLoss(
    vocation: Vocation,
    skill: Skill,
    percent: number,
  ): void {
    const state = this.requireSkill(skill);
    let level = state.level;
    let tries = state.tries;
    let total = tries;
    for (let step = MIN_SKILL_LEVEL; step < level; step++) {
      total += getSkillTriesForNextLevel(vocation, skill, step);
    }
    let lost = Math.floor(total * percent);
    while (lost > tries) {
      if (level <= MIN_SKILL_LEVEL) {
        level = MIN_SKILL_LEVEL;
        tries = 0;
        lost = 0;
        break;
      }
      lost -= tries;
      level -= 1;
      tries = getSkillTriesForNextLevel(vocation, skill, level);
    }
    this.skillStates.set(skill, {
      skill,
      level,
      tries: Math.max(0, tries - lost),
    });
  }

  loseExperience(eventId: string, amount: number): ProgressionMutation {
    this.assertAward(eventId, amount);
    if (!this.recordEvent(eventId, "experience")) {
      return { processed: false, changed: false };
    }
    const experience =
      this.currentExperience > BigInt(Math.floor(amount))
        ? this.currentExperience - BigInt(Math.floor(amount))
        : 0n;
    const level = getLevelForExperience(experience);
    const changed =
      experience !== this.currentExperience || level !== this.currentLevel;
    this.currentExperience = experience;
    if (level !== this.currentLevel) {
      this.currentLevel = level;
      this.currentMana = Math.min(this.currentMana, this.maxMana);
    }
    return { processed: true, changed };
  }

  awardMagicProgress(eventId: string, amount: number): ProgressionMutation {
    this.assertAward(eventId, amount);
    if (!this.recordEvent(eventId, "magic")) {
      return { processed: false, changed: false };
    }
    if (this.currentMagicLevel === MAX_MAGIC_LEVEL) {
      return { processed: true, changed: false };
    }
    let remaining = amount;
    while (remaining > 0 && this.currentMagicLevel < MAX_MAGIC_LEVEL) {
      const required = getManaForNextMagicLevel(
        getVocation(this.vocation, this.definitionVersion),
        this.currentMagicLevel,
      );
      const needed = required - this.currentManaSpent;
      if (remaining < needed) {
        this.currentManaSpent += remaining;
        remaining = 0;
        break;
      }
      remaining -= needed;
      this.currentMagicLevel += 1;
      this.currentManaSpent = 0;
    }
    return { processed: true, changed: true };
  }

  awardSkillTries(
    eventId: string,
    skill: Skill,
    amount: number,
  ): ProgressionMutation {
    this.assertAward(eventId, amount);
    if (!this.recordEvent(eventId, "skill")) {
      return { processed: false, changed: false };
    }
    return {
      processed: true,
      changed: this.addSkillTries(skill, amount),
    };
  }

  startTraining(options: {
    id: string;
    skill: Skill;
    intervalMs: number;
    tries: number;
    now: number;
  }): boolean {
    this.assertEventId(options.id);
    if (
      !Number.isInteger(options.intervalMs) ||
      options.intervalMs < MIN_TRAINING_INTERVAL_MS ||
      !Number.isSafeInteger(options.tries) ||
      options.tries < 1 ||
      options.tries > MAX_AWARD_AMOUNT
    ) {
      throw new Error("training schedule is out of range");
    }
    if (this.trainingSchedules.has(options.id)) return false;
    if (this.trainingSchedules.size >= MAX_SCHEDULES) {
      throw new Error("too many active training schedules");
    }
    this.trainingSchedules.set(options.id, {
      id: options.id,
      skill: options.skill,
      intervalMs: options.intervalMs,
      tries: options.tries,
      nextAt: options.now + options.intervalMs,
    });
    return true;
  }

  stopTraining(id: string): boolean {
    return this.trainingSchedules.delete(id);
  }

  tick(
    now: number,
    healthManaRegenerationBlocked: boolean,
    soulRegenerationBlocked = false,
    inProtectionZone = false,
    accountTier = this.accountTier,
    dailyStreakLevel = 0,
  ): ProgressionTick {
    const regenerationChanged = this.syncRegeneration(accountTier, now);
    const bonuses = DAILY_REWARD_RULES.streakBonuses;
    // Resting-area bonuses (Canary condition.cpp:1490-1535): inside a
    // protection zone health and mana only regenerate once the daily-reward
    // streak unlocks them, and double once it reaches the higher thresholds.
    // Outside a protection zone nothing here applies.
    const restingHealthBlocked =
      inProtectionZone && dailyStreakLevel < bonuses.hpRegeneration;
    const restingManaBlocked =
      inProtectionZone && dailyStreakLevel < bonuses.mpRegeneration;
    const healthBlocked = healthManaRegenerationBlocked || restingHealthBlocked;
    const manaBlocked = healthManaRegenerationBlocked || restingManaBlocked;
    const healthMultiplier =
      inProtectionZone && dailyStreakLevel >= bonuses.doubleHpRegeneration
        ? 2
        : 1;
    const manaMultiplier =
      inProtectionZone && dailyStreakLevel >= bonuses.doubleMpRegeneration
        ? 2
        : 1;
    // The streak-7 bonus is Canary's own RegenSoul event, which ticks purely
    // on standing in a protection zone — so it bypasses both the usual PZ
    // block and the recent-kill arming that gates soul everywhere else.
    const restingSoul =
      inProtectionZone && dailyStreakLevel >= bonuses.soulRegeneration;
    // Soul only regenerates while a recent qualifying kill keeps it armed and
    // the player is outside a protection zone (Canary CONDITION_SOUL rules).
    const soulBlocked =
      soulRegenerationBlocked ||
      (!restingSoul && (inProtectionZone || now >= this.soulEligibleUntil));
    if (healthBlocked) {
      this.nextHealthAt = now + this.regeneration.healthIntervalMs;
    }
    if (manaBlocked) {
      this.nextManaAt = now + this.regeneration.manaIntervalMs;
    }
    if (soulBlocked) {
      this.nextSoulAt = now + this.regeneration.soulIntervalMs;
    }
    const health = healthBlocked
      ? { count: 0, nextAt: this.nextHealthAt }
      : this.dueTicks(
          now,
          this.nextHealthAt,
          this.regeneration.healthIntervalMs,
        );
    const mana = manaBlocked
      ? { count: 0, nextAt: this.nextManaAt }
      : this.dueTicks(
          now,
          this.nextManaAt,
          this.regeneration.manaIntervalMs,
        );
    const soul = soulBlocked
      ? { count: 0, nextAt: this.nextSoulAt }
      : this.dueTicks(
          now,
          this.nextSoulAt,
          this.regeneration.soulIntervalMs,
        );
    this.nextHealthAt = health.nextAt;
    this.nextManaAt = mana.nextAt;
    this.nextSoulAt = soul.nextAt;

    const manaBefore = this.currentMana;
    const soulBefore = this.currentSoul;
    this.currentMana = Math.min(
      this.maxMana,
      this.currentMana + mana.count * this.regeneration.manaAmount * manaMultiplier,
    );
    this.currentSoul = Math.min(
      this.maxSoul,
      this.currentSoul + soul.count * this.regeneration.soulAmount,
    );
    const restedStamina = this.tickRestingStamina(
      now,
      inProtectionZone && dailyStreakLevel >= bonuses.staminaRegeneration,
    );

    let trained = false;
    for (const schedule of this.trainingSchedules.values()) {
      const due = this.dueTicks(
        now,
        schedule.nextAt,
        schedule.intervalMs,
      );
      schedule.nextAt = due.nextAt;
      if (due.count === 0) continue;
      trained =
        this.addSkillTries(schedule.skill, schedule.tries * due.count) ||
        trained;
    }
    return {
      changed:
        regenerationChanged ||
        manaBefore !== this.currentMana ||
        soulBefore !== this.currentSoul ||
        restedStamina ||
        trained,
      healthGain: health.count * this.regeneration.healthAmount * healthMultiplier,
    };
  }

  /**
   * The streak-4 resting bonus. The clock only advances while the bonus is
   * live, so leaving the protection zone parks the timer instead of banking
   * stamina the player did not rest for.
   */
  private tickRestingStamina(now: number, active: boolean): boolean {
    if (!active) {
      this.nextRestingStaminaAt = 0;
      return false;
    }
    if (this.nextRestingStaminaAt === 0) {
      this.nextRestingStaminaAt =
        now + RESTING_STAMINA_FIRST_INTERVAL_MS;
      return false;
    }
    const result = regenerateRestingStamina(
      this.currentStamina,
      this.nextRestingStaminaAt,
      now,
    );
    this.nextRestingStaminaAt = result.nextRegenAt;
    if (!result.changed) return false;
    this.currentStamina = result.staminaMinutes;
    return true;
  }

  private syncRegeneration(accountTier: AccountTier, now: number): boolean {
    if (accountTier === this.accountTier) return false;
    this.accountTier = accountTier;
    const regeneration = getAccountRegeneration(
      this.vocation,
      this.definitionVersion,
      accountTier,
    );
    if (regeneration === this.regeneration) return false;
    this.regeneration = regeneration;
    this.nextHealthAt = now + this.regeneration.healthIntervalMs;
    this.nextManaAt = now + this.regeneration.manaIntervalMs;
    this.nextSoulAt = now + this.regeneration.soulIntervalMs;
    return true;
  }

  private get stats() {
    // Hot getter (speed/maxMana/maxHealth read every step and regen tick);
    // recompute only when one of the derivation inputs actually changed.
    const cached = this.cachedStats;
    if (
      cached &&
      cached.vocation === this.vocation &&
      cached.level === this.currentLevel &&
      cached.wheel === this.wheelModifier &&
      cached.equipment === this.equipmentModifier
    ) {
      return cached.value;
    }
    const value = deriveCharacterStats({
      vocation: this.vocation,
      definitionVersion: this.definitionVersion,
      level: this.currentLevel,
      equipment: [this.equipmentModifier],
      wheel: this.wheelModifier,
    });
    this.cachedStats = {
      vocation: this.vocation,
      level: this.currentLevel,
      wheel: this.wheelModifier,
      equipment: this.equipmentModifier,
      value,
    };
    return value;
  }

  get equipmentSkillBonus(): EquipmentSkillBonuses {
    return this.equipmentSkillBonuses;
  }

  /**
   * What equipped gear alone adds to each derived stat, for the character
   * panel's hover breakdown. Re-runs the same derivation without the equipment
   * modifier and diffs, so it stays right whatever ends up feeding it.
   */
  get equipmentStatBonuses(): {
    maxHealth: number;
    maxMana: number;
    capacity: number;
    speed: number;
  } {
    const withEquipment = this.stats;
    const without = deriveCharacterStats({
      vocation: this.vocation,
      definitionVersion: this.definitionVersion,
      level: this.currentLevel,
      wheel: this.wheelModifier,
    });
    return {
      maxHealth: withEquipment.maxHealth - without.maxHealth,
      maxMana: withEquipment.maxMana - without.maxMana,
      capacity: withEquipment.capacity - without.capacity,
      speed: withEquipment.speed - without.speed,
    };
  }

  /** Equipment contribution to max stats, for save-snapshot checks. */
  get equipmentMaxStatModifier(): {
    readonly maxHealth: number;
    readonly maxMana: number;
  } {
    return {
      maxHealth: this.equipmentModifier.maxHealth ?? 0,
      maxMana: this.equipmentModifier.maxMana ?? 0,
    };
  }

  /** Display-only; returns whether the stored value actually changed. */
  setEquipmentSkillBonuses(bonuses: EquipmentSkillBonuses): boolean {
    if (sameSkillBonuses(this.equipmentSkillBonuses, bonuses)) return false;
    this.equipmentSkillBonuses = bonuses;
    return true;
  }

  setWheelModifier(modifier: DerivedStatModifier): void {
    this.wheelModifier = modifier;
    this.currentMana = Math.min(this.currentMana, this.maxMana);
  }

  /**
   * Equipment-derived stat bonuses (imbuement Swiftness/Featherweight).
   * Value-compared so the per-tick sync only invalidates the memoized stats
   * when a bonus actually changed; returns whether it did.
   */
  setEquipmentModifier(modifier: DerivedStatModifier): boolean {
    const current = this.equipmentModifier;
    if (
      (current.maxHealth ?? 0) === (modifier.maxHealth ?? 0) &&
      (current.maxMana ?? 0) === (modifier.maxMana ?? 0) &&
      (current.capacity ?? 0) === (modifier.capacity ?? 0) &&
      (current.capacityPercentOfBase ?? 0) ===
        (modifier.capacityPercentOfBase ?? 0) &&
      (current.speed ?? 0) === (modifier.speed ?? 0)
    ) {
      return false;
    }
    this.equipmentModifier = modifier;
    this.currentMana = Math.min(this.currentMana, this.maxMana);
    return true;
  }

  private addSkillTries(skill: Skill, amount: number): boolean {
    const state = this.requireSkill(skill);
    if (state.level === MAX_SKILL_LEVEL) return false;
    let level = state.level;
    let tries = state.tries;
    let remaining = Math.min(MAX_PROGRESSION_VALUE, amount);
    while (remaining > 0 && level < MAX_SKILL_LEVEL) {
      const required = getSkillTriesForNextLevel(
        getVocation(this.vocation, this.definitionVersion),
        skill,
        level,
      );
      const needed = required - tries;
      if (remaining < needed) {
        tries += remaining;
        remaining = 0;
        break;
      }
      remaining -= needed;
      level += 1;
      tries = 0;
    }
    this.skillStates.set(skill, { skill, level, tries });
    return level !== state.level || tries !== state.tries;
  }

  private dueTicks(
    now: number,
    nextAt: number,
    intervalMs: number,
  ): DueTicks {
    if (now < nextAt) return { count: 0, nextAt };
    const elapsedTicks = Math.floor((now - nextAt) / intervalMs) + 1;
    const count = Math.min(
      MAX_SCHEDULE_TICKS_PER_SERVER_TICK,
      elapsedTicks,
    );
    return {
      count,
      nextAt:
        elapsedTicks > count
          ? now + intervalMs
          : nextAt + count * intervalMs,
    };
  }

  private recordEvent(id: string, type: ProgressionEventType): boolean {
    if (this.processedEventIds.has(id)) return false;
    this.processedEventIds.add(id);
    this.sessionEvents.push({ id, type });
    return true;
  }

  private requireSkill(skill: Skill): CharacterSkill {
    const state = this.skillStates.get(skill);
    if (!state) throw new Error(`character skill ${skill} is missing`);
    return state;
  }

  private assertAward(eventId: string, amount: number): void {
    this.assertEventId(eventId);
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > MAX_AWARD_AMOUNT
    ) {
      throw new Error("progression award is out of range");
    }
  }

  private assertEventId(eventId: string): void {
    if (!EVENT_ID_PATTERN.test(eventId)) {
      throw new Error("progression event id is invalid");
    }
  }

  private assertResourceAmount(amount: number): void {
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AWARD_AMOUNT) {
      throw new Error("resource amount is out of range");
    }
  }
}
