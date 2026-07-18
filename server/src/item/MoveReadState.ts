import type { ItemRow } from "./ItemRow";
import type { MoveAncestryEntry } from "./MoveAncestryEntry";

export interface MoveReadState {
  characterCount: number;
  items: ItemRow[];
  slotTarget: ItemRow | null;
  ancestry: MoveAncestryEntry[];
  itemDepth: number | null;
  ownedCount: number | null;
}
