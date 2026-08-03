/**
 * Canary's `Player::getExpForLevel` (player.cpp), evaluated in bigint so it
 * stays exact at every level — its C++ counterpart runs in `uint64_t`, and JS
 * `number` silently loses precision past level ~81k. The division comes before
 * the multiplication, exactly as Canary writes it; the numerator is always a
 * multiple of 6, so the order does not change any value.
 */
export function getExperienceForLevel(level: number): bigint {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error("character level is out of range");
  }
  const value = BigInt(level);
  return ((((value - 6n) * value + 17n) * value - 12n) / 6n) * 100n;
}
