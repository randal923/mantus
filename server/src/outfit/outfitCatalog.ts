/**
 * The pinned outfit and mount catalog. Definitions are static content: a look
 * type or mount id that is not here can never be granted or selected, so the
 * catalog is the outer bound on what any client can ever wear (charter rule 1).
 *
 * Mount speed is server-side truth — `MOUNTS.get(id).speed` is what the
 * movement code adds, and the client's displayed speed is decoration
 * (charter rule 8).
 */
export interface OutfitDefinition {
  readonly lookType: number;
  readonly name: string;
  /** Granted to every character at creation. */
  readonly starter?: boolean;
}

export interface MountDefinition {
  readonly mountId: number;
  readonly name: string;
  /** The mount's own outfit sprite, drawn under the rider. */
  readonly lookType: number;
  /** Walk-speed points the mount adds while ridden. */
  readonly speed: number;
}

const OUTFIT_DEFINITIONS: ReadonlyArray<OutfitDefinition> = [
  { lookType: 128, name: "Citizen", starter: true },
  { lookType: 136, name: "Citizen", starter: true },
  { lookType: 129, name: "Hunter" },
  { lookType: 137, name: "Hunter" },
  { lookType: 130, name: "Mage" },
  { lookType: 138, name: "Mage" },
  { lookType: 131, name: "Knight" },
  { lookType: 139, name: "Knight" },
  { lookType: 132, name: "Nobleman" },
  { lookType: 140, name: "Noblewoman" },
  { lookType: 133, name: "Summoner" },
  { lookType: 141, name: "Summoner" },
  { lookType: 134, name: "Warrior" },
  { lookType: 142, name: "Barbarian" },
];

const MOUNT_DEFINITIONS: ReadonlyArray<MountDefinition> = [
  { mountId: 1, name: "Widow Queen", lookType: 368, speed: 10 },
  { mountId: 2, name: "Racing Bird", lookType: 369, speed: 10 },
  { mountId: 3, name: "War Bear", lookType: 370, speed: 10 },
  { mountId: 4, name: "Black Sheep", lookType: 371, speed: 10 },
  { mountId: 5, name: "Midnight Panther", lookType: 372, speed: 20 },
  { mountId: 6, name: "Draptor", lookType: 373, speed: 20 },
  { mountId: 7, name: "Titanica", lookType: 374, speed: 20 },
  { mountId: 8, name: "Tin Lizzard", lookType: 375, speed: 20 },
  { mountId: 9, name: "Blazebringer", lookType: 376, speed: 20 },
  { mountId: 10, name: "Rapid Boar", lookType: 377, speed: 20 },
];

export const OUTFITS: ReadonlyMap<number, OutfitDefinition> = new Map(
  OUTFIT_DEFINITIONS.map((definition) => [definition.lookType, definition]),
);

export const MOUNTS: ReadonlyMap<number, MountDefinition> = new Map(
  MOUNT_DEFINITIONS.map((definition) => [definition.mountId, definition]),
);

/** Look types every character owns from creation. */
export const STARTER_LOOK_TYPES: ReadonlyArray<number> = OUTFIT_DEFINITIONS
  .filter((definition) => definition.starter)
  .map((definition) => definition.lookType);
