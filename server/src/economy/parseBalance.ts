export function parseBalance(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("bank balance is out of range");
  }
  return parsed;
}
