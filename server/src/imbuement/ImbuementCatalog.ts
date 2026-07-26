export type ImbuementEffect =
  | { readonly kind: "damage"; readonly element: string; readonly percent: number }
  | { readonly kind: "reduction"; readonly element: string; readonly percent: number }
  | {
      readonly kind: "skill";
      readonly skill: "axe" | "club" | "sword" | "distance" | "fist" | "shielding";
      readonly amount: number;
    }
  | { readonly kind: "magic-level"; readonly amount: number }
  | {
      readonly kind: "leech";
      readonly resource: "life" | "mana";
      /** Hundredths of a percent: 500 -> 5%. */
      readonly amountHundredthsPercent: number;
      readonly chanceHundredthsPercent: number;
    }
  | {
      readonly kind: "critical";
      readonly damageHundredthsPercent: number;
      readonly chanceHundredthsPercent: number;
    }
  | { readonly kind: "speed"; readonly amount: number }
  | { readonly kind: "capacity"; readonly percent: number }
  | {
      readonly kind: "paralysis";
      readonly removeChancePercent: number;
      readonly pvpDeflect: boolean;
    };

export interface ImbuementBase {
  readonly id: number;
  readonly name: string;
  readonly priceGold: number;
  readonly protectionPriceGold: number;
  readonly successPercent: number;
  readonly removeCostGold: number;
  readonly durationSeconds: number;
}

export interface ImbuementCategory {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly aggressive: boolean;
}

export interface ImbuementDefinition {
  readonly id: number;
  readonly name: string;
  readonly baseId: number;
  readonly categoryId: number;
  readonly categorySlug: string;
  readonly subgroup?: string;
  readonly iconId: number;
  readonly premium: boolean;
  readonly description: string;
  readonly effect: ImbuementEffect;
  readonly astralSources: ReadonlyArray<{
    readonly itemTypeId: number;
    readonly count: number;
  }>;
  readonly scrollItemTypeId?: number;
}

export interface ImbuementCatalog {
  readonly bases: ReadonlyMap<number, ImbuementBase>;
  readonly categories: ReadonlyMap<string, ImbuementCategory>;
  readonly imbuements: ReadonlyMap<number, ImbuementDefinition>;
}
