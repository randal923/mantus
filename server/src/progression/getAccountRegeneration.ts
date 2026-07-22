import type { AccountTier, CharacterVocation } from "@tibia/protocol";
import type { Vocation } from "./Vocation";
import { getVocation } from "./getVocation";

export function getAccountRegeneration(
  vocationId: CharacterVocation,
  definitionVersion: number,
  _accountTier: AccountTier,
): Vocation["regeneration"] {
  return getVocation(vocationId, definitionVersion).regeneration;
}
