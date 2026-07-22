import type { ItemLocation } from "../item/ItemLocation";

export type InventoryDestination = Extract<
  ItemLocation,
  { kind: "container" }
>;
