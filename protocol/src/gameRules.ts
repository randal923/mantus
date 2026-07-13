/**
 * Gameplay pacing shared so the client can animate at the server's speed.
 * The server remains the enforcer; the client copy is display-only.
 */
export const GAME_RULES = {
  stepCooldownMs: 250,
} as const;
