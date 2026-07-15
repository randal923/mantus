import type { PlayerState } from "@tibia/protocol";
import type { Character } from "./character/Character";

interface PlayerPosition {
  x: number;
  y: number;
  z: number;
}

export class Player {
  lastStepAt = 0;
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
  x: number;
  y: number;
  z: number;
  direction: Character["direction"];

  constructor(
    character: Character,
    position: PlayerPosition,
  ) {
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
    this.x = position.x;
    this.y = position.y;
    this.z = position.z;
    this.direction = character.direction;
    this.outfit = character.outfit;
    this.townId = character.townId;
    this.lastLoginAt = character.lastLoginAt;
    this.version = character.version;
  }

  toState(): PlayerState {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      z: this.z,
      direction: this.direction,
      outfit: this.outfit,
    };
  }
}
