import type { Account } from "../AccountStore";
import { getAccountStatus } from "../getAccountStatus";
import type { Player } from "../Player";
import type { DialogueCondition } from "./DialogueGraph";

/**
 * Evaluates a branch's requirements against live state. Called at the moment
 * the node executes, never when the choice was offered: quest state, level,
 * and premium can all change between the two (charter rule 4).
 */
export function evaluateDialogueConditions(
  conditions: ReadonlyArray<DialogueCondition> | undefined,
  player: Player,
  account: Account | null,
  now: number,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((condition) => {
    if (condition.kind === "level") return player.level >= condition.minimum;
    if (condition.kind === "premium") {
      const premium =
        account !== null &&
        getAccountStatus(account, now).accountTier === "premium";
      return premium === condition.required;
    }
    const current = player.storageValue(condition.key);
    if (condition.operator === "eq") return current === condition.value;
    if (condition.operator === "neq") return current !== condition.value;
    if (condition.operator === "gte") return current >= condition.value;
    if (condition.operator === "lte") return current <= condition.value;
    if (condition.operator === "gt") return current > condition.value;
    return current < condition.value;
  });
}
