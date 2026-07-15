import type { Position } from "@tibia/protocol";

export interface MapAction {
  readonly kind: "ladder";
  readonly activation: "use";
  readonly source: Position;
  readonly destination: Position;
  readonly itemId: number;
}
