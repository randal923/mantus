import type { EquipmentSlot } from "@tibia/protocol";

export interface StarterSet {
  readonly equipment: ReadonlyArray<{
    readonly typeId: number;
    readonly slot: EquipmentSlot;
    readonly count?: number;
  }>;
  readonly backpackContents: ReadonlyArray<{
    readonly typeId: number;
    readonly count: number;
  }>;
}
