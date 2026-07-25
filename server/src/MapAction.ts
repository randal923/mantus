import type { Position } from "@tibia/protocol";

export interface MapAction {
  /**
   * `rope-hole` is the one kind that does not move the player who acts: the
   * rope lifts whatever stands on the floor below out beside the hole, so its
   * `destination` is on the hole's own floor rather than one above.
   */
  readonly kind: "ladder" | "dropdown" | "rope-spot" | "rope-hole";
  readonly activation: "use" | "use-with";
  readonly source: Position;
  readonly destination: Position;
  readonly itemId: number;
}
