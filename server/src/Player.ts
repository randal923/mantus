import type { Position } from "@tibia/protocol";
import type { Character } from "./character/Character";
import { Creature } from "./creature/Creature";

export class Player extends Creature<Character["outfit"]> {
  readonly vocation: Character["vocation"];
  readonly level: number;
  readonly experience: number;
  readonly mana: number;
  readonly maxMana: number;
  readonly capacity: number;
  readonly townId: number;
  readonly lastLoginAt: Date | null;
  readonly version: number;
  private speedModifier = 0;

  constructor(character: Character, position: Position) {
    super({
      id: character.id,
      kind: "player",
      name: character.displayName,
      position,
      direction: character.direction,
      outfit: character.outfit,
      health: character.health,
      maxHealth: character.maxHealth,
    });
    this.vocation = character.vocation;
    this.level = character.level;
    this.experience = Number(character.experience);
    this.mana = character.mana;
    this.maxMana = character.maxMana;
    this.capacity = character.capacity;
    this.townId = character.townId;
    this.lastLoginAt = character.lastLoginAt;
    this.version = character.version;
  }

  override get stepSpeed(): number {
    return Math.max(10, 110 + (this.level - 1) + this.speedModifier);
  }

  setSpeedModifier(modifier: number): void {
    if (!Number.isInteger(modifier)) throw new Error("speed modifier must be an integer");
    this.speedModifier = modifier;
  }

}
