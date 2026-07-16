import type {
  CreatureKind,
  CreatureOutfit,
  CreatureState,
  Direction,
  Position,
} from "@tibia/protocol";
import { ConditionManager } from "../combat/ConditionManager";

export abstract class Creature<
  TOutfit extends CreatureOutfit = CreatureOutfit,
> {
  nextStepAt = 0;
  positionRevision = 0;
  direction: Direction;
  readonly id: string;
  readonly kind: CreatureKind;
  readonly name: string;
  readonly outfit: TOutfit;
  readonly conditions = new ConditionManager();
  private readonly activeConditions = new Set<string>();
  private deathHandled = false;
  private defenseBlockCount = 0;
  private lastDefenseTickAt: number | null = null;
  private currentHealth: number;
  private currentMaxHealth: number;
  private currentPosition: Position;
  private readonly baseLight: {
    readonly intensity: number;
    readonly color: number;
  };

  protected constructor(options: {
    id: string;
    kind: CreatureKind;
    name: string;
    position: Position;
    direction: Direction;
    outfit: TOutfit;
    health: number;
    maxHealth: number;
    light?: {
      readonly intensity: number;
      readonly color: number;
    };
  }) {
    this.id = options.id;
    this.kind = options.kind;
    this.name = options.name;
    this.currentPosition = { ...options.position };
    this.direction = options.direction;
    this.outfit = options.outfit;
    this.currentHealth = options.health;
    this.currentMaxHealth = options.maxHealth;
    this.baseLight = options.light ?? { intensity: 0, color: 0 };
  }

  get position(): Position {
    return this.currentPosition;
  }

  get health(): number {
    return this.currentHealth;
  }

  get maxHealth(): number {
    return this.currentMaxHealth;
  }

  abstract get stepSpeed(): number;

  moveTo(position: Position): void {
    this.currentPosition = { ...position };
    this.positionRevision++;
  }

  get healthPercent(): number {
    return Math.min(
      100,
      Math.max(0, Math.round((this.health / this.maxHealth) * 100)),
    );
  }

  setHealth(health: number): void {
    if (!Number.isInteger(health)) throw new Error("health must be an integer");
    this.currentHealth = Math.max(0, Math.min(this.maxHealth, health));
  }

  claimDeath(): boolean {
    if (this.health > 0 || this.deathHandled) return false;
    this.deathHandled = true;
    return true;
  }

  revive(health = this.maxHealth): void {
    this.deathHandled = false;
    this.setHealth(health);
  }

  setMaxHealth(maxHealth: number): void {
    if (!Number.isInteger(maxHealth) || maxHealth < 1) {
      throw new Error("max health must be a positive integer");
    }
    this.currentMaxHealth = maxHealth;
    this.currentHealth = Math.min(this.currentHealth, maxHealth);
  }

  applyCondition(condition: string): void {
    this.activeConditions.add(condition);
  }

  removeCondition(condition: string): void {
    this.activeConditions.delete(condition);
  }

  hasCondition(condition: string): boolean {
    return (
      this.activeConditions.has(condition) ||
      this.conditions.has(condition)
    );
  }

  tickDefense(now: number): void {
    if (this.lastDefenseTickAt === null) {
      this.lastDefenseTickAt = now;
      return;
    }
    const elapsed = now - this.lastDefenseTickAt;
    if (elapsed < 1_000) return;
    const gained = Math.floor(elapsed / 1_000);
    this.defenseBlockCount = Math.min(2, this.defenseBlockCount + gained);
    this.lastDefenseTickAt += gained * 1_000;
  }

  consumeDefenseBlock(now: number): boolean {
    this.tickDefense(now);
    if (this.defenseBlockCount === 0) return false;
    this.defenseBlockCount--;
    return true;
  }

  toState(): CreatureState {
    const conditionLight = this.conditions.light;
    const light =
      conditionLight.intensity > 0 ? conditionLight : this.baseLight;
    return {
      id: this.id,
      kind: this.kind,
      name: this.name,
      position: { ...this.position },
      positionRevision: this.positionRevision,
      direction: this.direction,
      outfit: (this.conditions.outfit ?? this.outfit) as TOutfit,
      healthPercent: this.healthPercent,
      ...(light.intensity > 0 ? { light } : {}),
    };
  }
}
