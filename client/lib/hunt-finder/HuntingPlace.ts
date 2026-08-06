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

/**
 * One cave of a hunt that has several. A city's rotworm caves are one hunting
 * place with one set of creatures, gear and drops — what differs between them
 * is where you climb in and which ring you walk once inside.
 */
export interface HuntingSpot {
  readonly Name: string;
  readonly Generated?: boolean;
  /** Where the map marker sits: the tile the route is entered from. */
  readonly Position: HuntingPosition;
  readonly WayPath?: HuntingPath;
  readonly RoutePath: HuntingPath;
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
  /**
   * Built by `tools/buildHuntingPlaces.mjs` from the world's own spawn and
   * walkability data rather than written by hand. The route is real geometry;
   * the level, xp and loot figures are inherited estimates, so the window
   * says so.
   */
  readonly Generated?: boolean;
  readonly RouteRequirements: string;
  readonly RecommendedImbues: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly RecommendedSupplies: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly ValuableDrops: ReadonlyArray<string>;
  readonly Monsters: ReadonlyArray<HuntingMonster>;
  readonly WayPath: HuntingPath;
  readonly RoutePath: HuntingPath;
  /**
   * What to call this entry's own route once it is one cave among several.
   * Absent while a hunt has a single cave, where the hunt's name says it all.
   */
  readonly SpotName?: string;
  /**
   * Where this hunt's own cave is entered from open ground — the tile a pin
   * goes on. The way in is on the surface even when the hunt is three floors
   * down, which is where a player starts the walk.
   */
  readonly SpotPosition?: HuntingPosition;
  /** The hunt's other caves; its own route is always the first spot. */
  readonly Spots?: ReadonlyArray<HuntingSpot>;
  readonly Equipments: Readonly<
    Partial<Record<HuntingVocation, Readonly<Record<string, string>>>>
  >;
}
