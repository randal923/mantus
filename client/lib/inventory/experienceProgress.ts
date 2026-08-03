/**
 * Progress through the current level, as plain numbers safe for a bar.
 *
 * Experience arrives as a decimal string because there is no level cap and the
 * totals outgrow `Number.MAX_SAFE_INTEGER`. Only the *difference* is narrowed
 * here: one level's span stays far inside the safe range at any level, while
 * the totals themselves never pass through `number`.
 */
export function experienceProgress(character: {
  readonly experience: string;
  readonly experienceForCurrentLevel: string;
  readonly experienceForNextLevel: string;
}): { readonly inLevel: number; readonly forLevel: number } {
  const current = BigInt(character.experienceForCurrentLevel);
  return {
    inLevel: Number(BigInt(character.experience) - current),
    forLevel: Number(BigInt(character.experienceForNextLevel) - current),
  };
}
