import type { ItemLocation } from "./ItemLocation";

export interface Item {
  readonly id: string;
  readonly typeId: number;
  readonly count: number;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly location: ItemLocation;
  readonly seedKey?: string;
}
