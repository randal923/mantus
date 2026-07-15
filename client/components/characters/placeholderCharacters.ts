import type { CharacterSummary } from "./characterTypes";

// Display-only placeholders until the server sends the account's character
// list; portraitSpriteIds are south-facing idle frames of outfits 128-131.
export const PLACEHOLDER_CHARACTERS: ReadonlyArray<CharacterSummary> = [
  {
    id: "char-1",
    name: "Avara Stormblade",
    level: 42,
    vocation: "Knight",
    portraitSpriteId: 70478,
  },
  {
    id: "char-2",
    name: "Meryl Dawnwhisper",
    level: 27,
    vocation: "Druid",
    portraitSpriteId: 69442,
  },
  {
    id: "char-3",
    name: "Rogan Swiftarrow",
    level: 15,
    vocation: "Paladin",
    portraitSpriteId: 68493,
  },
];
