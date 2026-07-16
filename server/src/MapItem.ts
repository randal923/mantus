import type { WorldItemSource } from "./item/WorldItemSource";

export interface MapItem {
  readonly instanceId: string;
  readonly itemId: number;
  readonly stackIndex: number;
  readonly mutable: boolean;
  readonly revision?: number;
  readonly count?: number;
  readonly source?: WorldItemSource;
}
