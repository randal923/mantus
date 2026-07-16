import type { Direction, Position } from "@tibia/protocol";
import { Creature } from "./Creature";
import type { NpcType } from "./NpcType";

export class Npc extends Creature {
  readonly home: Position;
  readonly spawnRadius: number;

  constructor(options: {
    id: string;
    type: NpcType;
    position: Position;
    direction: Direction;
    home: Position;
    spawnRadius: number;
  }) {
    super({
      id: options.id,
      kind: "npc",
      name: options.type.name,
      position: options.position,
      direction: options.direction,
      outfit: options.type.outfit,
      health: options.type.health,
      maxHealth: options.type.maxHealth,
    });
    this.type = options.type;
    this.home = { ...options.home };
    this.spawnRadius = options.spawnRadius;
  }

  readonly type: NpcType;

  override get stepSpeed(): number {
    return Math.max(10, this.type.speed);
  }
}
