interface PlaceholderCharacter {
  characterName: string;
  level: number;
  vocation: string;
  portraitSpriteId: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
}

// Display-only placeholder until the server sends real character stats.
// Health/mana/level shown here are decoration; the server owns the real values.
export const PLACEHOLDER_CHARACTER: PlaceholderCharacter = {
  characterName: "Hero",
  level: 1,
  vocation: "None",
  portraitSpriteId: 67704,
  health: 150,
  maxHealth: 150,
  mana: 55,
  maxMana: 55,
};
