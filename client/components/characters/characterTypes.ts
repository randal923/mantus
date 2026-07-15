export type Vocation = "Knight" | "Paladin" | "Sorcerer" | "Druid";

export interface CharacterSummary {
  id: string;
  name: string;
  level: number;
  vocation: Vocation | "None";
  portraitSpriteId: number;
}
