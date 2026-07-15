import type { Position } from "@tibia/protocol";

export interface MapTransition {
  readonly kind: "floor-change" | "hole" | "teleport";
  readonly activation: "step";
  readonly source: Position;
  readonly destination: Position;
  readonly itemId: number;
}
