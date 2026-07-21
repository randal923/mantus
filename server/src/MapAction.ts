import type { Position } from "@tibia/protocol";

export interface MapAction {
  readonly kind: "ladder" | "dropdown" | "rope-spot";
  readonly activation: "use" | "use-with";
  readonly source: Position;
  readonly destination: Position;
  readonly itemId: number;
}
