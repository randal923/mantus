import type { EquipmentSlot } from "@tibia/protocol";

export interface WikiItem {
  readonly id: number;
  readonly name: string;
  readonly spriteId: number;
  readonly weight: number;
  readonly description?: string;
  readonly primaryType?: string;
  readonly equipmentSlot?: EquipmentSlot;
  readonly weaponType?: string;
  readonly attack?: number;
  readonly defense?: number;
  readonly extraDefense?: number;
  readonly armor?: number;
  readonly range?: number;
  readonly hitChance?: number;
  readonly manaCost?: number;
  readonly minimumDamage?: number;
  readonly maximumDamage?: number;
  readonly wandType?: string;
  readonly imbuementSlots?: number;
  readonly containerCapacity?: number;
  readonly charges?: number;
  readonly speed?: number;
  readonly requirements?: {
    readonly level?: number;
    readonly vocations?: ReadonlyArray<string>;
  };
}
