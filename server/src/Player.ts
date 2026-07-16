import type { Position, Skill } from "@tibia/protocol";
import type { Character } from "./character/Character";
import { Creature } from "./creature/Creature";
import { CharacterProgression } from "./progression/CharacterProgression";
import { deriveCharacterStats } from "./progression/deriveCharacterStats";

export class Player extends Creature<Character["outfit"]> {
  readonly vocation: Character["vocation"];
  readonly townId: number;
  readonly lastLoginAt: Date | null;
  readonly version: number;
  readonly progression: CharacterProgression;
  private speedModifier = 0;

  constructor(character: Character, position: Position, now = Date.now()) {
    const stats = deriveCharacterStats({
      vocation: character.vocation,
      definitionVersion: character.progressionDefinitionVersion,
      level: character.level,
    });
    if (
      !Number.isInteger(character.health) ||
      character.health < 0 ||
      character.health > stats.maxHealth
    ) {
      throw new Error("persisted health is out of range");
    }
    super({
      id: character.id,
      kind: "player",
      name: character.displayName,
      position,
      direction: character.direction,
      outfit: character.outfit,
      health: character.health,
      maxHealth: stats.maxHealth,
    });
    this.vocation = character.vocation;
    this.townId = character.townId;
    this.lastLoginAt = character.lastLoginAt;
    this.version = character.version;
    this.progression = new CharacterProgression(
      character.vocation,
      character.progressionDefinitionVersion,
      {
        level: character.level,
        experience: Number(character.experience),
        magicLevel: character.magicLevel,
        manaSpent: Number(character.manaSpent),
        mana: character.mana,
        soul: character.soul,
        skills: character.skills,
        processedEventIds: character.progressionEventIds,
      },
      now,
    );
  }

  get level(): number {
    return this.progression.level;
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

  get capacity(): number {
    return this.progression.capacity;
  }

  override get stepSpeed(): number {
    return Math.max(10, this.progression.speed + this.speedModifier);
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

  tickProgression(now: number): boolean {
    const tick = this.progression.tick(
      now,
      this.hasCondition("no-regeneration"),
    );
    const healthBefore = this.health;
    if (tick.healthGain > 0) this.setHealth(this.health + tick.healthGain);
    return tick.changed || healthBefore !== this.health;
  }
}
