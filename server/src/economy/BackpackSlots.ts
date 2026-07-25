/** One locked container that can receive newly granted item rows. */
export interface BackpackContainer {
  readonly containerId: string;
  readonly capacity: number;
  readonly occupiedSlots: Set<number>;
}

/**
 * Locked destinations for granted rows, in fill order: the equipped backpack
 * first, then the containers nested inside it, depth-first by slot. Canary
 * fills the container the player has open; the server has no open-container
 * concept for economy grants, so this deterministic order stands in for it.
 */
export interface BackpackSlots {
  readonly containers: ReadonlyArray<BackpackContainer>;
}
