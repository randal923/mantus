export type PvpWorldType = "no-pvp" | "pvp" | "pvp-enforced";

/**
 * PVP policy as typed data (Canary defaults for a "pvp" world). All checks
 * consuming these values run at combat execution time inside the tick —
 * never at intent enqueue time and never client-side.
 */
export interface PvpPolicy {
  readonly worldType: PvpWorldType;
  /** Players below this level can neither attack nor be attacked by players. */
  readonly protectionLevel: number;
  /** White skull lifetime, refreshed on each aggressive act. */
  readonly whiteSkullDurationMs: number;
  readonly redSkullDurationMs: number;
  readonly blackSkullDurationMs: number;
  /** Window in which a victim may justifiably avenge an unjustified kill. */
  readonly orangeSkullDurationMs: number;
  /** Canary hardcodes a 4h "day" for frag windows. */
  readonly fragWindowDayMs: number;
  readonly fragWindowWeekMs: number;
  readonly fragWindowMonthMs: number;
  readonly dayKillsToRed: number;
  readonly weekKillsToRed: number;
  readonly monthKillsToRed: number;
  readonly dayKillsToBlack: number;
  readonly weekKillsToBlack: number;
  readonly monthKillsToBlack: number;
  /** In-fight duration, refreshed on each player-vs-player aggression. */
  readonly combatLockMs: number;
  /** Frags older than this are pruned on load and ignored in counts. */
  readonly fragExpiryMs: number;
  /** Black-skulled players respawn crippled. */
  readonly blackSkullRespawnHealth: number;
  readonly blackSkullRespawnMana: number;
}

export const PVP_POLICY: PvpPolicy = {
  worldType: "pvp",
  protectionLevel: 7,
  whiteSkullDurationMs: 15 * 60_000,
  redSkullDurationMs: 24 * 3_600_000,
  blackSkullDurationMs: 3 * 24 * 3_600_000,
  orangeSkullDurationMs: 7 * 24 * 3_600_000,
  fragWindowDayMs: 4 * 3_600_000,
  fragWindowWeekMs: 7 * 24 * 3_600_000,
  fragWindowMonthMs: 30 * 24 * 3_600_000,
  dayKillsToRed: 3,
  weekKillsToRed: 5,
  monthKillsToRed: 10,
  dayKillsToBlack: 6,
  weekKillsToBlack: 10,
  monthKillsToBlack: 20,
  combatLockMs: 60_000,
  fragExpiryMs: 30 * 24 * 3_600_000,
  blackSkullRespawnHealth: 40,
  blackSkullRespawnMana: 0,
};
