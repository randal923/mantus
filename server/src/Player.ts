import {
  EMPTY_WHEEL_BONUSES,
  MAX_STAMINA_MINUTES,
  type AccountTier,
  type CreatureState,
  type HitBlock,
  type Position,
  type Skill,
  type WheelBonuses,
} from "@tibia/protocol";
import type { Character } from "./character/Character";
import { CombatAnalyzerTotals } from "./combat/CombatAnalyzerTotals";
import { Creature } from "./creature/Creature";
import { CharacterProgression } from "./progression/CharacterProgression";
import { deriveCharacterStats } from "./progression/deriveCharacterStats";
import { getDeathLossPercent } from "./progression/getDeathLossPercent";
import { getExperienceForLevel } from "./progression/getExperienceForLevel";
import { getVocation } from "./progression/getVocation";
import type { SkullState } from "./pvp/SkullState";
import { monotonicNow } from "./monotonicNow";

export class Player extends Creature<Character["outfit"]> {
  nextAttackAt = 0;
  invulnerableUntil = 0;
  /** Maintained by the party system; drives the public gray party shield. */
  partyMember = false;
  /** Maintained by the guild system; guild affiliation is public in Tibia. */
  guildName: string | null = null;
  /** True while the guild has an active war (drives public war emblems). */
  guildAtWar = false;
  /** Persistent PVP skull; maintained by the PvpTracker inside the tick. */
  skull: SkullState;
  /** Epoch ms when the persistent skull expires (null while none). */
  skullExpiresAt: number | null;
  /** Combat-analyzer counters for this session; never client-supplied. */
  readonly analyzer: CombatAnalyzerTotals;
  private currentVocation: Character["vocation"];
  readonly townId: number;
  readonly lastLoginAt: Date | null;
  readonly version: number;
  readonly progression: CharacterProgression;
  private premiumUntil: number | null;
  private readonly storageValues: Record<string, number>;
  private addAttackSkillPoint = false;
  private bloodHitCount = 0;
  private shieldBlockCount = 0;
  private speedModifier = 0;
  private currentWheelBonuses: WheelBonuses;

  constructor(
    character: Character,
    position: Position,
    now = monotonicNow(),
    premiumUntil: Date | null = null,
    wheelBonuses: WheelBonuses = EMPTY_WHEEL_BONUSES,
  ) {
    const stats = deriveCharacterStats({
      vocation: character.vocation,
      definitionVersion: character.progressionDefinitionVersion,
      level: character.level,
      wheel: wheelBonuses,
    });
    if (!Number.isInteger(character.health) || character.health < 0) {
      throw new Error("persisted health is out of range");
    }
    super({
      id: character.id,
      kind: "player",
      name: character.displayName,
      position,
      direction: character.direction,
      outfit: character.outfit,
      // Clamp instead of rejecting: wheel slices persist outside the
      // character row, so a crash between the two writes may leave health
      // above the currently-derivable maximum.
      health: Math.min(character.health, stats.maxHealth),
      maxHealth: stats.maxHealth,
    });
    this.analyzer = new CombatAnalyzerTotals(now);
    this.currentWheelBonuses = wheelBonuses;
    this.currentVocation = character.vocation;
    this.premiumUntil = premiumUntil?.getTime() ?? null;
    this.townId = character.townId;
    this.skull = character.skull;
    this.skullExpiresAt = character.skullExpiresAt?.getTime() ?? null;
    this.lastLoginAt = character.lastLoginAt;
    this.version = character.version;
    this.storageValues = { ...character.storageValues };
    const offlineSeconds =
      character.lastSeenAt === null
        ? 0
        : Math.max(
            0,
            Math.floor((now - character.lastSeenAt.getTime()) / 1_000),
          );
    this.progression = new CharacterProgression(
      character.vocation,
      character.progressionDefinitionVersion,
      this.accountTierAt(now),
      {
        level: character.level,
        experience: Number(character.experience),
        magicLevel: character.magicLevel,
        manaSpent: Number(character.manaSpent),
        mana: character.mana,
        soul: character.soul,
        stamina: character.stamina,
        offlineSeconds,
        skills: character.skills,
        processedEventIds: character.progressionEventIds,
      },
      now,
      wheelBonuses,
    );
  }

  get stamina(): number {
    return this.progression.stamina;
  }

  get maxStamina(): number {
    return MAX_STAMINA_MINUTES;
  }

  /** Experience multiplier from stamina at `now` (respects premium tier). */
  staminaExperienceMultiplier(now: number): number {
    return this.progression.staminaExperienceMultiplier(
      this.isPremiumAt(now),
    );
  }

  /** Decays hunting stamina once per kill that awarded experience. */
  decayHuntStamina(now: number): boolean {
    return this.progression.decayHuntStamina(now);
  }

  /** Arms soul regeneration after a qualifying kill (exp ≥ level). */
  armSoulRegeneration(now: number): void {
    this.progression.armSoulRegeneration(now);
  }

  get wheelBonuses(): WheelBonuses {
    return this.currentWheelBonuses;
  }

  get vocation(): Character["vocation"] {
    return this.currentVocation;
  }

  promote(vocation: Character["vocation"], now: number): void {
    this.progression.promote(vocation, now);
    this.currentVocation = vocation;
    this.setMaxHealth(this.progression.maxHealth);
  }

  /** The wheel's contribution to derived stats, for save-snapshot checks. */
  get wheelStatModifier(): {
    readonly maxHealth: number;
    readonly maxMana: number;
    readonly capacity: number;
  } {
    return {
      maxHealth: this.currentWheelBonuses.maxHealth,
      maxMana: this.currentWheelBonuses.maxMana,
      capacity: this.currentWheelBonuses.capacity,
    };
  }

  setWheelBonuses(bonuses: WheelBonuses): void {
    this.currentWheelBonuses = bonuses;
    this.progression.setWheelModifier({
      maxHealth: bonuses.maxHealth,
      maxMana: bonuses.maxMana,
      capacity: bonuses.capacity,
    });
    this.setMaxHealth(this.progression.maxHealth);
  }

  get level(): number {
    return this.progression.level;
  }

  accountTierAt(now: number): AccountTier {
    return this.premiumUntil !== null && this.premiumUntil > now
      ? "premium"
      : "free";
  }

  isPremiumAt(now: number): boolean {
    return this.accountTierAt(now) === "premium";
  }

  setPremiumUntil(premiumUntil: Date): void {
    this.premiumUntil = premiumUntil.getTime();
  }

  override toState(): CreatureState {
    const state = super.toState();
    return {
      ...state,
      ...(this.partyMember ? { partyStatus: "member" as const } : {}),
      ...(this.guildName
        ? { guildName: this.guildName, atWar: this.guildAtWar }
        : {}),
    };
  }

  storageValue(key: string): number {
    return this.storageValues[key] ?? -1;
  }

  setStorageValue(key: string, value: number): void {
    if (
      key.length < 1 ||
      key.length > 192 ||
      !Number.isInteger(value) ||
      value < -2_147_483_648 ||
      value > 2_147_483_647
    ) {
      throw new Error("character storage value is invalid");
    }
    this.storageValues[key] = value;
  }

  get storageSnapshot(): Readonly<Record<string, number>> {
    return { ...this.storageValues };
  }

  get experience(): number {
    return this.progression.experience;
  }

  get mana(): number {
    return this.progression.mana;
  }

  get maxMana(): number {
    return this.progression.maxMana;
  }

  spendMana(amount: number): boolean {
    return this.progression.spendMana(amount);
  }

  restoreMana(amount: number): number {
    return this.progression.restoreMana(amount);
  }

  spendSoul(amount: number): boolean {
    return this.progression.spendSoul(amount);
  }

  canFeed(durationSeconds: number, now: number): boolean {
    if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
      throw new Error("food duration is out of range");
    }
    const remainingMs = this.conditions.remainingMs("regeneration", now);
    if (remainingMs === 0) return true;
    return Math.floor(remainingMs / 1_000 + durationSeconds) < 1_200;
  }

  feed(durationSeconds: number, now: number): void {
    if (!this.canFeed(durationSeconds, now)) {
      throw new Error("player is full");
    }
    if (durationSeconds === 0) return;
    this.conditions.extend(
      {
        type: "regeneration",
        sourceId: this.id,
        durationMs: durationSeconds * 1_000,
        naturalRegeneration: true,
      },
      now,
    );
  }

  skillLevel(skill: Skill): number {
    const base =
      this.progression.skills.find((state) => state.skill === skill)?.level ??
      10;
    const boosts = this.currentWheelBonuses.skillBoosts;
    const boosted =
      skill === "sword" || skill === "club" || skill === "axe"
        ? base + boosts.melee
        : skill === "distance"
          ? base + boosts.distance
          : skill === "fist"
            ? base + boosts.fist
            : base;
    return Math.max(0, boosted + this.conditions.skillModifier(skill, boosted));
  }

  recordAttackBlock(block: HitBlock): void {
    if (block === "none") {
      this.addAttackSkillPoint = true;
      this.bloodHitCount = 30;
      this.shieldBlockCount = 30;
      return;
    }
    if (block === "shield" || block === "armor") {
      if (this.bloodHitCount > 0) {
        this.addAttackSkillPoint = true;
        this.bloodHitCount--;
        return;
      }
    }
    this.addAttackSkillPoint = false;
  }

  attackSkillTries(
    kind: "melee" | "distance",
    block: HitBlock,
  ): number {
    if (!this.addAttackSkillPoint) return 0;
    if (kind === "melee") return block === "immunity" ? 0 : 1;
    if (block === "none") return 2;
    return block === "shield" || block === "armor" ? 1 : 0;
  }

  consumeShieldTrainingBlock(): boolean {
    if (this.shieldBlockCount === 0) return false;
    this.shieldBlockCount--;
    return true;
  }

  restoreAfterDeath(): void {
    this.revive(this.maxHealth);
    this.restoreMana(this.maxMana);
  }

  /**
   * Applies the whole Canary death penalty once per eventId: experience,
   * magic level, and skills all lose the same server-computed fraction. The
   * fraction is derived here from live state — level, promotion, blessings,
   * and the unfair-fight reduction the caller measured this tick.
   */
  applyDeathPenalty(
    eventId: string,
    options: { unfairFightReduction?: number } = {},
  ): {
    lostExperience: number;
    lostMagicLevels: number;
    lostSkillLevels: ReadonlyArray<{ skill: Skill; levels: number }>;
  } {
    const percent = getDeathLossPercent({
      level: this.level,
      experience: this.experience,
      levelPercent: this.levelPercent,
      promoted: getVocation(this.vocation).promotedFrom !== null,
      blessings: this.blessings,
      unfairFightReduction: options.unfairFightReduction ?? 100,
    });
    const previousLevel = this.level;
    const result = this.progression.applyDeathLoss(eventId, percent);
    if (!result.processed) {
      return { lostExperience: 0, lostMagicLevels: 0, lostSkillLevels: [] };
    }
    if (this.level !== previousLevel) {
      this.setMaxHealth(this.progression.maxHealth);
    }
    return {
      lostExperience: result.lostExperience,
      lostMagicLevels: result.lostMagicLevels,
      lostSkillLevels: result.lostSkillLevels,
    };
  }

  /** Progress into the current level, 0–100, as Canary's `levelPercent`. */
  private get levelPercent(): number {
    const start = getExperienceForLevel(this.level);
    const next = getExperienceForLevel(this.level + 1);
    if (next <= start) return 0;
    return Math.min(
      100,
      Math.max(0, ((this.experience - start) * 100) / (next - start)),
    );
  }

  /**
   * Blessings carried into a death; each one reduces the penalty by 8% and,
   * once Feature 72 ships their purchase and persistence, protects carried
   * items. Nothing grants them yet, so this is 0 for every character.
   */
  get blessings(): number {
    return 0;
  }

  get capacity(): number {
    return this.progression.capacity;
  }

  override get stepSpeed(): number {
    return Math.max(
      10,
      this.progression.speed + this.speedModifier + this.conditions.speedModifier,
    );
  }

  setSpeedModifier(modifier: number): void {
    if (!Number.isInteger(modifier)) throw new Error("speed modifier must be an integer");
    this.speedModifier = modifier;
  }

  awardExperience(eventId: string, amount: number) {
    const previousLevel = this.level;
    const result = this.progression.awardExperience(eventId, amount);
    if (this.level !== previousLevel) {
      this.setMaxHealth(this.progression.maxHealth);
      this.setHealth(this.maxHealth);
    }
    return result;
  }

  awardMagicProgress(eventId: string, amount: number) {
    return this.progression.awardMagicProgress(eventId, amount);
  }

  awardSkillTries(eventId: string, skill: Skill, amount: number) {
    return this.progression.awardSkillTries(eventId, skill, amount);
  }

  tickProgression(now: number, inProtectionZone = false): boolean {
    const regenerationBlocked =
      !this.conditions.allowsNaturalRegeneration ||
      this.hasCondition("no-regeneration");
    const tick = this.progression.tick(
      now,
      regenerationBlocked,
      this.hasCondition("no-regeneration"),
      inProtectionZone,
      this.accountTierAt(now),
    );
    const healthBefore = this.health;
    if (tick.healthGain > 0) this.setHealth(this.health + tick.healthGain);
    return tick.changed || healthBefore !== this.health;
  }
}
