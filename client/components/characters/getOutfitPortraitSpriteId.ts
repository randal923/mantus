import type { CharacterLookType } from "@tibia/protocol";

const PORTRAIT_SPRITES: Readonly<Record<CharacterLookType, number>> = {
  128: 67704,
  136: 73307,
};

export function getOutfitPortraitSpriteId(lookType: CharacterLookType): number {
  return PORTRAIT_SPRITES[lookType];
}
