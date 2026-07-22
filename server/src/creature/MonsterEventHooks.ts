import type { Creature } from "./Creature";
import type { Monster } from "./Monster";
import type { Player } from "../Player";
import type { DamageRequest } from "../combat/Damage";

export interface MonsterEventHooks {
  onMonsterSpawn(monster: Monster, now: number): void;
  onMonsterThink(
    monster: Monster,
    now: number,
  ): ReadonlyArray<{ readonly target: Creature; readonly damage: DamageRequest }>;
  onPlayerAttackMonster(monster: Monster, attacker: Player, now: number): void;
  beforeMonsterDamage(
    monster: Monster,
    attacker: Player | Monster | undefined,
    amount: number,
    now: number,
  ): number;
  onMonsterDamaged(
    monster: Monster,
    attacker: Player | Monster | undefined,
    amount: number,
    now: number,
  ): void;
  onMonsterDeath(
    monster: Monster,
    damagerIds: ReadonlyArray<string>,
    mostDamagePlayerId: string | null,
    now: number,
  ): void;
  onCreatureTile(creature: Creature, now: number): DamageRequest | null;
}
