export interface SpellArtwork {
  width: number;
  height: number;
  spriteIds: ReadonlyArray<number>;
}

export interface SpellListSpell {
  id: string;
  name: string;
  words: string;
  artwork: SpellArtwork;
  requiredLevel: number;
  manaCost: number | null;
}
