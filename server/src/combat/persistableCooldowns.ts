import type { PersistedCooldown } from "./CooldownStore";

/** Matches the character_spell_cooldowns total_ms check (the 2 h avatars). */
const MAX_TOTAL_MS = 7_200_000;
const MAX_KEY_LENGTH = 128;

/**
 * Projects a session's live cooldown map into rows the store accepts:
 * still-hot entries only, bounded to what the table's checks allow. readyAt
 * stays as-is — monotonicNow() is epoch-based, so it round-trips across a
 * process restart the same way skull_expires_at does.
 */
export function persistableCooldowns(
  cooldowns: ReadonlyMap<string, { readyAt: number; totalMs: number }>,
  now: number,
): PersistedCooldown[] {
  const rows: PersistedCooldown[] = [];
  for (const [key, state] of cooldowns) {
    if (state.readyAt <= now) continue;
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) continue;
    if (state.totalMs <= 0 || state.totalMs > MAX_TOTAL_MS) continue;
    rows.push({ key, readyAt: state.readyAt, totalMs: state.totalMs });
  }
  return rows;
}
