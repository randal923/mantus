import type { Position } from "@tibia/protocol";

/** Ctrl+click on the game canvas: what was clicked and where to show the menu. */
export interface MapContextMenuState {
  readonly screen: { readonly x: number; readonly y: number };
  readonly position: Position;
  readonly creatureId: string | null;
  readonly itemIds: ReadonlyArray<number>;
}
