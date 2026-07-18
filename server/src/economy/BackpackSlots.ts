/** Locked equipped-backpack slot state used while granting new item rows. */
export interface BackpackSlots {
  readonly containerId: string;
  readonly capacity: number;
  readonly occupiedSlots: Set<number>;
}
