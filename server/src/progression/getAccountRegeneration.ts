import type { AccountTier, CharacterVocation } from "@tibia/protocol";
import type { Vocation } from "./Vocation";
import { getVocation } from "./getVocation";

export function getAccountRegeneration(
  vocationId: CharacterVocation,
  definitionVersion: number,
  accountTier: AccountTier,
): Vocation["regeneration"] {
  const vocation = getVocation(vocationId, definitionVersion);
  if (accountTier === "free" || !vocation.promotedVocation) {
    return vocation.regeneration;
  }
  // Promotion is not yet purchasable in this project, so premium accounts
  // receive Canary's promoted regeneration profile without changing vocation.
  return getVocation(
    vocation.promotedVocation,
    definitionVersion,
  ).regeneration;
}
