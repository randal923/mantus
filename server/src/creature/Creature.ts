import type {
  CreatureKind,
  CreatureOutfit,
  CreatureState,
  Direction,
  Position,
} from "@tibia/protocol";

export abstract class Creature<
  TOutfit extends CreatureOutfit = CreatureOutfit,
> {
  nextStepAt = 0;
  positionRevision = 0;
  direction: Direction;
  readonly id: string;
  readonly kind: CreatureKind;
  readonly name: string;
  readonly maxHealth: number;
  readonly outfit: TOutfit;
  private readonly activeConditions = new Set<string>();
  private currentHealth: number;
  private currentPosition: Position;

  protected constructor(options: {
    id: string;
    kind: CreatureKind;
    name: string;
    position: Position;
    direction: Direction;
    outfit: TOutfit;
    health: number;
    maxHealth: number;
  }) {
    this.id = options.id;
    this.kind = options.kind;
    this.name = options.name;
    this.currentPosition = { ...options.position };
    this.direction = options.direction;
    this.outfit = options.outfit;
    this.currentHealth = options.health;
    this.maxHealth = options.maxHealth;
  }

  get position(): Position {
    return this.currentPosition;
  }

  get health(): number {
    return this.currentHealth;
  }

  abstract get stepSpeed(): number;

  moveTo(position: Position): void {
    this.currentPosition = { ...position };
    this.positionRevision++;
  }

  setHealth(health: number): void {
    if (!Number.isInteger(health)) throw new Error("health must be an integer");
    this.currentHealth = Math.max(0, Math.min(this.maxHealth, health));
  }

  applyCondition(condition: string): void {
    this.activeConditions.add(condition);
  }

  removeCondition(condition: string): void {
    this.activeConditions.delete(condition);
  }

  hasCondition(condition: string): boolean {
    return this.activeConditions.has(condition);
  }

  toState(): CreatureState {
    return {
      id: this.id,
      kind: this.kind,
      name: this.name,
      position: { ...this.position },
      positionRevision: this.positionRevision,
      direction: this.direction,
      outfit: this.outfit,
      healthPercent: Math.min(
        100,
        Math.max(0, Math.round((this.health / this.maxHealth) * 100)),
      ),
    };
  }
}
