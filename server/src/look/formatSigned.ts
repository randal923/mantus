/** Canary's `std::showpos`: an explicit sign on every value ("+3", "-2"). */
export function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
