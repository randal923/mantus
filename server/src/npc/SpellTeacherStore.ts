import type { ItemMutation } from "../item/ItemMutation";

export type LearnSpellCommitResult =
  | {
      readonly status: "committed";
      readonly characterVersion: number;
      readonly storageKey: string;
      readonly mutation: ItemMutation;
    }
  | { readonly status: "already-known" }
  | { readonly status: "level-too-low" }
  | { readonly status: "insufficient-funds" };

/**
 * Durable spell purchases. One transaction takes the money (carried coins
 * first, then the bank), records the learned spell, bumps the character
 * version, and appends the audit row — a spell that was paid for but not
 * granted, or granted without a trail, cannot exist (charter rules 2/11).
 */
export interface SpellTeacherStore {
  commit(
    characterId: string,
    expectedCharacterVersion: number,
    spellId: string,
    minimumLevel: number,
    price: number,
    npcTypeId: string,
  ): Promise<LearnSpellCommitResult>;
}

/** The per-character storage key that records a learned spell. */
export function learnedSpellStorageKey(spellId: string): string {
  return `Spell.${spellId.replace(/-/g, "_")}`;
}
