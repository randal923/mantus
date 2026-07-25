import type { Creature } from "../creature/Creature";
import { Player } from "../Player";
import type { ConditionApplication } from "./Condition";
import type { SpellDefinition } from "./Spell";

export function spellCondition(
  source: Player,
  target: Creature,
  spell: SpellDefinition,
  magicLevel: number,
): ConditionApplication | null {
  const condition = spell.condition;
  if (!condition) return null;
  let magnitude = condition.magnitude;
  if (condition.speedFormula) {
    const baseSpeed =
      target instanceof Player ? target.progression.speed : target.stepSpeed;
    const targetSpeed = Math.floor(
      condition.speedFormula.coefficient *
        (baseSpeed - condition.speedFormula.base) +
        condition.speedFormula.base,
    );
    magnitude = Math.max(0, targetSpeed - baseSpeed);
  } else if (condition.speedTarget !== undefined) {
    magnitude = Math.max(0, target.stepSpeed - condition.speedTarget);
  }
  const capacity =
    condition.magicShieldFormula && target instanceof Player
      ? Math.floor(
          Math.min(
            target.maxMana,
            condition.magicShieldFormula.base +
              condition.magicShieldFormula.level * target.level +
              condition.magicShieldFormula.magicLevel * magicLevel,
          ),
        )
      : undefined;
  const attributes = {
    ...(condition.meleePercent !== undefined
      ? { meleePercent: condition.meleePercent }
      : {}),
    ...(condition.distancePercent !== undefined
      ? { distancePercent: condition.distancePercent }
      : {}),
    ...(condition.defensePercent !== undefined
      ? { defensePercent: condition.defensePercent }
      : {}),
    ...(condition.fistPercent !== undefined
      ? { fistPercent: condition.fistPercent }
      : {}),
    ...(condition.damageDealtPercent !== undefined
      ? { damageDealtPercent: condition.damageDealtPercent }
      : {}),
    ...(condition.damageReceivedPercent !== undefined
      ? { damageReceivedPercent: condition.damageReceivedPercent }
      : {}),
    ...(condition.healingDealtPercent !== undefined
      ? { healingDealtPercent: condition.healingDealtPercent }
      : {}),
  };
  return {
    type: condition.type,
    sourceId: source.id,
    durationMs: condition.durationMs,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(condition.disablesDefense ? { disablesDefense: true } : {}),
    ...(magnitude !== undefined ? { magnitude } : {}),
    ...(condition.tickIntervalMs !== undefined
      ? { tickIntervalMs: condition.tickIntervalMs }
      : {}),
    ...(condition.tickAmounts
      ? { tickAmounts: condition.tickAmounts }
      : {}),
    ...(condition.damageType ? { damageType: condition.damageType } : {}),
    ...(condition.light ? { light: condition.light } : {}),
    ...(capacity !== undefined ? { capacity } : {}),
  };
}
