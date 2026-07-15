import type { PlayerState, Position } from "@tibia/protocol";
import type { Character } from "./character/Character";

export class Player {
  nextStepAt = 0;
  positionRevision = 0;
  readonly id: string;
  readonly name: string;
  readonly vocation: Character["vocation"];
  readonly level: number;
  readonly experience: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly mana: number;
  readonly maxMana: number;
  readonly capacity: number;
  readonly outfit: Character["outfit"];
  readonly townId: number;
  readonly lastLoginAt: Date | null;
  readonly version: number;
  private speedModifier = 0;
  private currentPosition: Position;
  direction: Character["direction"];

  constructor(character: Character, position: Position) {
    this.id = character.id;
    this.name = character.displayName;
    this.vocation = character.vocation;
    this.level = character.level;
    this.experience = Number(character.experience);
    this.health = character.health;
    this.maxHealth = character.maxHealth;
    this.mana = character.mana;
    this.maxMana = character.maxMana;
    this.capacity = character.capacity;
    this.currentPosition = { ...position };
    this.direction = character.direction;
    this.outfit = character.outfit;
    this.townId = character.townId;
    this.lastLoginAt = character.lastLoginAt;
    this.version = character.version;
  }

  get position(): Position {
    return this.currentPosition;
  }

  moveTo(position: Position): void {
    this.currentPosition = { ...position };
    this.positionRevision++;
  }

  get stepSpeed(): number {
    return Math.max(10, 110 + (this.level - 1) + this.speedModifier);
  }

  setSpeedModifier(modifier: number): void {
    if (!Number.isInteger(modifier)) throw new Error("speed modifier must be an integer");
    this.speedModifier = modifier;
  }

  toState(): PlayerState {
    return {
      id: this.id,
      name: this.name,
      position: { ...this.position },
      positionRevision: this.positionRevision,
      direction: this.direction,
      outfit: this.outfit,
    };
  }
}
