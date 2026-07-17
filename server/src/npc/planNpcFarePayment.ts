export function planNpcFarePayment(
  gold: number,
  platinum: number,
  cost: number,
): {
  readonly goldSpent: number;
  readonly platinumSpent: number;
  readonly goldChange: number;
} | null {
  if (
    !Number.isSafeInteger(gold) ||
    gold < 0 ||
    !Number.isSafeInteger(platinum) ||
    platinum < 0 ||
    !Number.isSafeInteger(cost) ||
    cost < 0
  ) {
    throw new Error("invalid NPC fare balance");
  }
  const total = gold + platinum * 100;
  if (!Number.isSafeInteger(total)) {
    throw new Error("NPC fare balance is too large");
  }
  if (total < cost) return null;

  const maximumGoldSpend = Math.min(gold, cost);
  const platinumSpent = Math.ceil((cost - maximumGoldSpend) / 100);
  const platinumValue = platinumSpent * 100;
  if (platinumSpent > platinum) return null;
  if (platinumValue >= cost) {
    return {
      goldSpent: 0,
      platinumSpent,
      goldChange: platinumValue - cost,
    };
  }
  return {
    goldSpent: cost - platinumValue,
    platinumSpent,
    goldChange: 0,
  };
}
