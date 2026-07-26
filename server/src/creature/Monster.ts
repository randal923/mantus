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
  /**
   * Exaltation Forge state (Feature 78): assigned server-side at the sweep,
   * never from the network. Stack 1..5 = influenced, 15 = fiendish (Canary
   * monster.cpp:3865-3888). Zero = plain monster.
   */
  forgeStack = 0;
  /** Server-clock deadline after which a fiendish monster reverts. */
  fiendishUntil = 0;

  override get stepSpeed(): number {
    return Math.max(10, this.type.speed + this.conditions.speedModifier);
  }

  get forgeKind(): "influenced" | "fiendish" | null {
    if (this.forgeStack <= 0) return null;
    return this.forgeStack >= 15 ? "fiendish" : "influenced";
  }

  /**
   * Canary monster.cpp:3550-3563 — attack multiplies by 1.35 + (stack-1)*0.1,
   * defense by 1 + 0.1*stack; health scaling is applied once on assignment.
   */
  get forgeAttackMultiplier(): number {
    if (this.forgeStack <= 0) return 1;
    return 1.35 + (this.forgeStack - 1) * 0.1;
  }

  get forgeDefenseMultiplier(): number {
    if (this.forgeStack <= 0) return 1;
    return 1 + 0.1 * this.forgeStack;
  }

  /**
   * Canary monster.cpp:872-875 — exp multiplier `(stack + 10) / 10` under
   * INTEGER division: stacks 1..9 give x1, 10..15 give x2 (mirrored
   * deliberately, quirk and all).
   */
  get forgeExperienceMultiplier(): number {
    if (this.forgeStack <= 0) return 1;
    return this.forgeStack <= 15 ? Math.trunc((this.forgeStack + 10) / 10) : 28;
  }

  override toState(): CreatureState {
    const state = super.toState();
    const kind = this.forgeKind;
    const decorated = kind
      ? {
          ...state,
          forgeState: {
            kind,
            // Canary sends the stack on influenced icons and 0 on fiendish.
            stack: kind === "influenced" ? this.forgeStack : 0,
          },
        }
      : state;
    return this.type.flags.healthHidden
      ? { ...decorated, healthPercent: null }
      : decorated;
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
