import { WHEEL_BASE_VOCATION, type WheelBonuses } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemType } from "../item/ItemType";
import type { Player } from "../Player";

export interface PlayerSpecials {
  readonly criticalChance: number;
  readonly criticalDamagePercent: number;
  readonly lifeLeechChance: number;
  readonly lifeLeechPercent: number;
  readonly manaLeechChance: number;
  readonly manaLeechPercent: number;
}

/** Combat Mastery's two-handed leg: +4/8/12 % critical damage per stage. */
const COMBAT_MASTERY_CRITICAL = [4, 8, 12] as const;

function combatMasteryCriticalDamage(
  equipment: ReadonlyArray<{ item: unknown; type: ItemType }>,
  player: Player,
): number {
  if (WHEEL_BASE_VOCATION[player.vocation] !== "Knight") return 0;
  const stage = player.wheelBonuses.revelationStages.blue;
  if (stage < 1) return 0;
  // Only weapons carry the two-handed slot type, so equipment holding one
  // means it is wielded.
  const twoHanded = equipment.some(
    (entry) => entry.type.slotType === "two-handed",
  );
  if (!twoHanded) return 0;
  return COMBAT_MASTERY_CRITICAL[Math.min(stage, 3) - 1] ?? 0;
}

/** In-avatar crit damage per purple stage (player_wheel.cpp:3262-3311). */
const AVATAR_CRITICAL_DAMAGE = [5, 10, 15] as const;

export function playerSpecials(
  equipment: ReadonlyArray<{ item: unknown; type: ItemType }>,
  player?: Player,
  now?: number,
): PlayerSpecials {
  const wheel: WheelBonuses | undefined = player?.wheelBonuses;
  // Canary overwrites SKILL_CRITICAL_HIT_CHANCE with 100 % while an avatar
  // is active (player.cpp:7378-7381) and adds 5 %/stage crit damage.
  const avatarStage =
    player && now !== undefined && now < player.avatarUntil
      ? Math.min(Math.max(player.avatarStage, 0), 3)
      : 0;
  const criticalChance =
    avatarStage > 0
      ? 100
      : equipment.reduce(
          (total, entry) => total + (entry.type.criticalHitChance ?? 0),
          0,
        ) / 100;
  // Gem-supreme critical damage is additive with equipment, like Canary's
  // SKILL_CRITICAL_HIT_DAMAGE folding in WheelStat_t::CRITICAL_DAMAGE
  // (player.cpp:7365); Combat Mastery's two-handed leg rides the same skill
  // (player_wheel.cpp:3009-3053, player.cpp:7366).
  const criticalDamagePercent =
    50 +
    (wheel?.criticalDamagePercent ?? 0) +
    (player ? combatMasteryCriticalDamage(equipment, player) : 0) +
    (avatarStage > 0 ? AVATAR_CRITICAL_DAMAGE[avatarStage - 1] ?? 0 : 0) +
    equipment.reduce(
      (total, entry) => total + (entry.type.criticalHitDamage ?? 0),
      0,
    ) /
      100;
  const lifeLeechPercent =
    equipment.reduce(
      (total, entry) => total + (entry.type.lifeLeechAmount ?? 0),
      0,
    ) / 100;
  const manaLeechPercent =
    equipment.reduce(
      (total, entry) => total + (entry.type.manaLeechAmount ?? 0),
      0,
    ) / 100;
  return {
    criticalChance,
    criticalDamagePercent,
    lifeLeechChance: equipment.reduce(
      (total, entry) => total + (entry.type.lifeLeechChance ?? 0),
      0,
    ),
    lifeLeechPercent,
    manaLeechChance: equipment.reduce(
      (total, entry) => total + (entry.type.manaLeechChance ?? 0),
      0,
    ),
    manaLeechPercent,
  };
}
