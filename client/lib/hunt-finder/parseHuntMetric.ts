interface MetricToken {
  readonly amount: number;
  readonly multiplier: number | null;
}

const MULTIPLIERS: Readonly<Record<string, number>> = {
  K: 1_000,
  KK: 1_000_000,
  M: 1_000_000,
};

export function parseHuntMetric(value: string): number {
  const tokens: MetricToken[] = [];
  for (const match of value.toUpperCase().matchAll(/(\d+(?:\.\d+)?)\s*(KK|K|M)?/g)) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) continue;
    tokens.push({
      amount,
      multiplier: match[2] ? (MULTIPLIERS[match[2]] ?? 1) : null,
    });
  }
  if (tokens.length === 0) return 0;
  const fallbackMultiplier =
    [...tokens].reverse().find((token) => token.multiplier !== null)
      ?.multiplier ?? 1;
  const total = tokens.reduce(
    (sum, token) =>
      sum + token.amount * (token.multiplier ?? fallbackMultiplier),
    0,
  );
  return total / tokens.length;
}
