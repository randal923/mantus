/**
 * Client IDs verified against this asset pack — see client/ASSETS.md.
 * Purely cosmetic choices; the server only knows walkable vs blocked.
 */
export const SPRITE_IDS = {
  grass: 106,
  grassFlowersA: 108,
  grassFlowersB: 109,
  trees: [25134, 25135, 25136] as const,
  citizenOutfit: 128,
} as const;
