import {
  MAX_CHARACTER_LEVEL,
  MAX_MAGIC_LEVEL,
  MAX_PROGRESSION_VALUE,
  MAX_SKILL_LEVEL,
  MIN_SKILL_LEVEL,
  SKILLS,
  type AccountTier,
  type CharacterVocation,
  type Skill,
} from "@tibia/protocol";
import type { CharacterSkill } from "./CharacterSkill";
import {
  deriveCharacterStats,
  type DerivedStatModifier,
} from "./deriveCharacterStats";
import { getExperienceForLevel } from "./getExperienceForLevel";
import { getLevelForExperience } from "./getLevelForExperience";
import { getAccountRegeneration } from "./getAccountRegeneration";
import { getManaForNextMagicLevel } from "./getManaForNextMagicLevel";
import { getSkillTriesForNextLevel } from "./getSkillTriesForNextLevel";
import { getVocation } from "./getVocation";
import type { ProgressionEvent, ProgressionEventType } from "./ProgressionEvent";

const MAX_AWARD_AMOUNT = 1_000_000_000;
const MAX_SCHEDULES = 4;
const MIN_TRAINING_INTERVAL_MS = 250;
const MAX_SCHEDULE_TICKS_PER_SERVER_TICK = 5;
const EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

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
  private currentExperience: number;
  private currentMagicLevel: number;
  private currentManaSpent: number;
  private currentMana: number;
  private currentSoul: number;
  private readonly skillStates = new Map<Skill, CharacterSkill>();
  private readonly processedEventIds: Set<string>;
  private readonly sessionEvents: ProgressionEvent[] = [];
  private readonly trainingSchedules = new Map<string, TrainingSchedule>();
  private nextHealthAt: number;
  private nextManaAt: number;
  private nextSoulAt: number;
  private accountTier: AccountTier;
  private regeneration: ReturnType<typeof getAccountRegeneration>;
  private wheelModifier: DerivedStatModifier;

  constructor(
    vocation: CharacterVocation,
    readonly definitionVersion: number,
    accountTier: AccountTier,
    state: {
      level: number;
      experience: number;
      magicLevel: number;
      manaSpent: number;
      mana: number;
      soul: number;
      skills: ReadonlyArray<CharacterSkill>;
      processedEventIds: ReadonlyArray<string>;
    },
    now: number,
    wheelModifier: DerivedStatModifier = {},
  ) {
    this.currentVocation = vocation;
    this.wheelModifier = wheelModifier;
    const definition = getVocation(vocation, definitionVersion);
    this.accountTier = accountTier;
    this.regeneration = getAccountRegeneration(
      vocation,
      definitionVersion,
      accountTier,
    );
    if (
      !Number.isSafeInteger(state.experience) ||
      state.experience < 0 ||
      state.experience > getExperienceForLevel(MAX_CHARACTER_LEVEL) ||
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

  get experience(): number {
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

  get skills(): ReadonlyArray<CharacterSkill> {
    return SKILLS.map((skill) => ({ ...this.requireSkill(skill) }));
  }

  get attackSpeedMs(): number {
    return getVocation(
      this.vocation,
      this.definitionVersion,
    ).attackSpeedMs;
  }

  get sessionProgressionEvents(): ReadonlyArray<ProgressionEvent> {
    return this.sessionEvents;
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
    const maximum = getExperienceForLevel(MAX_CHARACTER_LEVEL);
    const experience = Math.min(maximum, this.currentExperience + amount);
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

  loseExperience(eventId: string, amount: number): ProgressionMutation {
    this.assertAward(eventId, amount);
    if (!this.recordEvent(eventId, "experience")) {
      return { processed: false, changed: false };
    }
    const experience = Math.max(0, this.currentExperience - amount);
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
    accountTier = this.accountTier,
  ): ProgressionTick {
    const regenerationChanged = this.syncRegeneration(accountTier, now);
    if (healthManaRegenerationBlocked) {
      this.nextHealthAt = now + this.regeneration.healthIntervalMs;
      this.nextManaAt = now + this.regeneration.manaIntervalMs;
    }
    if (soulRegenerationBlocked) {
      this.nextSoulAt = now + this.regeneration.soulIntervalMs;
    }
    const health = healthManaRegenerationBlocked
      ? { count: 0, nextAt: this.nextHealthAt }
      : this.dueTicks(
          now,
          this.nextHealthAt,
          this.regeneration.healthIntervalMs,
        );
    const mana = healthManaRegenerationBlocked
      ? { count: 0, nextAt: this.nextManaAt }
      : this.dueTicks(
          now,
          this.nextManaAt,
          this.regeneration.manaIntervalMs,
        );
    const soul = soulRegenerationBlocked
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
      this.currentMana + mana.count * this.regeneration.manaAmount,
    );
    this.currentSoul = Math.min(
      this.maxSoul,
      this.currentSoul + soul.count * this.regeneration.soulAmount,
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
        trained,
      healthGain: health.count * this.regeneration.healthAmount,
    };
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
    return deriveCharacterStats({
      vocation: this.vocation,
      definitionVersion: this.definitionVersion,
      level: this.currentLevel,
      wheel: this.wheelModifier,
    });
  }

  setWheelModifier(modifier: DerivedStatModifier): void {
    this.wheelModifier = modifier;
    this.currentMana = Math.min(this.currentMana, this.maxMana);
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
