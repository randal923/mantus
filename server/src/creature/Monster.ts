import type {
  CreatureState,
  Direction,
  Position,
} from "@tibia/protocol";
import { Creature } from "./Creature";
import type { MonsterType } from "./MonsterType";

export class Monster extends Creature {
  readonly home: Position;
  readonly spawnRadius: number;

  constructor(options: {
    id: string;
    type: MonsterType;
    position: Position;
    direction: Direction;
    home: Position;
    spawnRadius: number;
  }) {
    super({
      id: options.id,
      kind: "monster",
      name: options.type.name,
      position: options.position,
      direction: options.direction,
      outfit: options.type.outfit,
      health: options.type.health,
      maxHealth: options.type.maxHealth,
      light: options.type.light,
    });
    this.type = options.type;
    this.home = { ...options.home };
    this.spawnRadius = options.spawnRadius;
  }

  readonly type: MonsterType;
  private readonly playerDamage = new Map<string, number>();

  override get stepSpeed(): number {
    return Math.max(10, this.type.speed + this.conditions.speedModifier);
  }

  override toState(): CreatureState {
    const state = super.toState();
    return this.type.flags.healthHidden
      ? { ...state, healthPercent: null }
      : state;
  }

  recordPlayerDamage(playerId: string, amount: number): void {
    if (amount <= 0) return;
    this.playerDamage.set(playerId, (this.playerDamage.get(playerId) ?? 0) + amount);
  }

  damageFrom(playerId: string): number {
    return this.playerDamage.get(playerId) ?? 0;
  }

  damagerIds(): string[] {
    return [...this.playerDamage.keys()];
  }

  topDamagerId(): string | null {
    return (
      [...this.playerDamage.entries()].sort(
        ([leftId, left], [rightId, right]) =>
          right - left || leftId.localeCompare(rightId),
      )[0]?.[0] ?? null
    );
  }
}
