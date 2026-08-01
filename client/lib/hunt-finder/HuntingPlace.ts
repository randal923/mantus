export type HuntingVocation =
  | "Druid"
  | "Knight"
  | "Monk"
  | "Paladin"
  | "Sorcerer";

export type HuntingTeamSize = "Solo" | "Duo" | "Party x4";

export interface HuntingPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface HuntingPath {
  readonly Coordinates: Readonly<
    Record<
      string,
      ReadonlyArray<readonly [HuntingPosition, HuntingPosition]>
    >
  >;
  readonly Paths: ReadonlyArray<string>;
  readonly Position?: HuntingPosition;
  readonly TemplePosition?: HuntingPosition;
}

export interface HuntingMonster {
  readonly Name: string;
  readonly Resistances?: string;
  readonly Charm?: string;
}

export interface HuntingPlace {
  readonly Name: string;
  readonly Level: string;
  readonly Type: ReadonlyArray<HuntingTeamSize>;
  readonly "Xp/Hour": string;
  readonly "Loot/Hour": string;
  readonly Location: string;
  readonly Vocation: ReadonlyArray<HuntingVocation>;
  readonly PremiumRequired: boolean;
  readonly New?: boolean;
  readonly RouteRequirements: string;
  readonly RecommendedImbues: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly RecommendedSupplies: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly ValuableDrops: ReadonlyArray<string>;
  readonly Monsters: ReadonlyArray<HuntingMonster>;
  readonly WayPath: HuntingPath;
  readonly RoutePath: HuntingPath;
  readonly Equipments: Readonly<
    Partial<Record<HuntingVocation, Readonly<Record<string, string>>>>
  >;
}
