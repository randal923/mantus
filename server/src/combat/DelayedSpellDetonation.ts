import type { DamageType, Position } from "@tibia/protocol";
import type { PlayerSpecials } from "./playerSpecials";
import type { SpellDefinition } from "./Spell";

/**
 * A queued fuse detonation (Divine Grenade): the cast marks the position and
 * snapshots the roll, and the tick re-resolves the caster and every target
 * when the fuse runs out (charter rule 4 — no stale validation).
 */
export interface DelayedSpellDetonation {
  readonly executeAt: number;
  readonly casterId: string;
  readonly position: Position;
  readonly area: SpellDefinition["area"];
  readonly damageType: DamageType;
  readonly minimum: number;
  readonly maximum: number;
  readonly effectId: number;
  readonly ignoreArmor: boolean;
  readonly ignoreShield: boolean;
  readonly specials: PlayerSpecials;
  readonly wheelDamagePercent: number;
  readonly wheelLifeLeechPercent: number;
  readonly wheelManaLeechPercent: number;
}
