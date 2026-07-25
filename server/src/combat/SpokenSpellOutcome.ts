/**
 * What happened to a line of chat that was offered to the spell pipeline.
 * `no-match` means the text was ordinary speech, `cast` means the server
 * accepted and executed the spell, and `rejected` means the words named a
 * spell the caster could not cast right now.
 */
export type SpokenSpellOutcome = "no-match" | "cast" | "rejected";
