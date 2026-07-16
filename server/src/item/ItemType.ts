import type { EquipmentSlot } from "@tibia/protocol";

type DamageType =
  | "death"
  | "drown"
  | "earth"
  | "energy"
  | "fire"
  | "holy"
  | "ice"
  | "lifedrain"
  | "manadrain"
  | "physical"
  | "poison";

type SkillType = "axe" | "club" | "dist" | "fist" | "shield" | "sword";

export interface ItemType {
  readonly id: number;
  readonly clientId: number;
  readonly name: string;
  readonly article?: string;
  readonly plural?: string;
  readonly description?: string;
  readonly primaryType?: string;
  readonly spriteId: number;
  readonly stackable: boolean;
  readonly maxCount: number;
  /** Canary stores weight as hundredths of one ounce. */
  readonly weight: number;
  readonly worth?: number;
  readonly equipmentSlot?: EquipmentSlot;
  readonly slotType?: string;
  readonly weaponType?: string;
  readonly ammoType?: string;
  readonly shootType?: string;
  readonly attack?: number;
  readonly defense?: number;
  readonly extraDefense?: number;
  readonly armor?: number;
  readonly range?: number;
  readonly hitChance?: number;
  readonly maxHitChance?: number;
  readonly manaCost?: number;
  readonly minimumDamage?: number;
  readonly maximumDamage?: number;
  readonly wandType?: string;
  readonly breakChance?: number;
  readonly imbuementSlots?: number;
  readonly containerCapacity?: number;
  readonly pickupable: boolean;
  readonly movable: boolean;
  readonly decay?: { readonly durationSeconds?: number; readonly targetId?: number };
  readonly transformEquipTo?: number;
  readonly transformDeEquipTo?: number;
  readonly rotateTo?: number;
  readonly kind?: string;
  readonly levelDoor?: number;
  readonly field?: string;
  readonly charges?: number;
  readonly text?: {
    readonly readable: boolean;
    readonly writeable: boolean;
    readonly allowDistanceRead: boolean;
    readonly maxLength: number;
  };
  readonly requirements?: {
    readonly level?: number;
    readonly vocations?: ReadonlyArray<string>;
  };
  readonly elementDamage?: Readonly<Partial<Record<DamageType, number>>>;
  readonly absorbPercent?: Readonly<Partial<Record<DamageType, number>>>;
  readonly skillModifiers?: Readonly<Partial<Record<SkillType, number>>>;
  readonly magicLevelPoints?: number;
  readonly speed?: number;
  readonly criticalHitChance?: number;
  readonly criticalHitDamage?: number;
  readonly lifeLeechAmount?: number;
  readonly lifeLeechChance?: number;
  readonly manaLeechAmount?: number;
  readonly manaLeechChance?: number;
  readonly light: { readonly intensity: number; readonly color: number };
  readonly elevation: number;
  readonly render: {
    readonly ground: boolean;
    readonly groundBorder: boolean;
    readonly onBottom: boolean;
    readonly onTop: boolean;
    readonly stackable: boolean;
    readonly fluidContainer: boolean;
    readonly splash: boolean;
    readonly hangable: boolean;
    readonly hookSouth: boolean;
    readonly hookEast: boolean;
    readonly lyingCorpse: boolean;
    readonly animateAlways: boolean;
    readonly topEffect: boolean;
  };
}
