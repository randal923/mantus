import type { TFunction } from "i18next";

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

export function getPlaceholderCharacter(t: TFunction): PlaceholderCharacter {
  return {
    characterName: t("character.hero"),
    level: 1,
    vocation: t("character.noVocation"),
    portraitSpriteId: 67704,
    health: 150,
    maxHealth: 150,
    mana: 55,
    maxMana: 55,
  };
}
