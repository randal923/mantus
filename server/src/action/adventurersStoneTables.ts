import type { Position } from "@tibia/protocol";

/**
 * Adventurer's Stone data, mirrored from Canary's
 * `actions/adventurers_guild/adventurers_stone.lua` (temples only; Canary
 * ships with depots disabled). Each temple box is the exact Canary
 * `fromPos`/`toPos` range; `temple` is that town's temple position from
 * `server/data/otservbr.map.json`, used for the return trip.
 */
export interface AdventurersStoneTemple {
  readonly townId: number;
  readonly from: Position;
  readonly to: Position;
  readonly temple: Position;
}

export const ADVENTURERS_STONE_STORAGE_KEY =
  "Quest.U9_80.AdventurersGuild.Stone";

/** Canary's guild arrival tile (`Position(32210, 32300, 6)`). */
export const GUILD_ARRIVAL: Position = { x: 32210, y: 32300, z: 6 };

/**
 * The Adventurers Guild protection zone around the arrival tile. Using the
 * stone again anywhere inside this box returns the player to the temple they
 * came from, on top of Canary's own exit portals below.
 */
export const GUILD_AREA: { readonly from: Position; readonly to: Position } = {
  from: { x: 32195, y: 32285, z: 6 },
  to: { x: 32230, y: 32315, z: 6 },
};

/**
 * The two magic forcefields north of the guild hall that lead back out
 * (Canary `movements/teleport/adventurers_guild.lua`, aid 4253 stamped by
 * `startup/tables/teleport.lua`). Their OTBM teleport destination is 0,0,0
 * because the destination depends on the town the player arrived from, so the
 * map converter cannot resolve them; `AdventurersGuildExitService` supplies
 * the destination at execution time instead.
 */
export const GUILD_EXIT_PORTALS: ReadonlyArray<Position> = [
  { x: 32209, y: 32292, z: 6 },
  { x: 32210, y: 32292, z: 6 },
];

export const ADVENTURERS_STONE_TEMPLES: ReadonlyArray<AdventurersStoneTemple> =
  [
    { townId: 5, from: { x: 32727, y: 31632, z: 7 }, to: { x: 32736, y: 31639, z: 7 }, temple: { x: 32732, y: 31634, z: 7 } }, // Ab'Dendriel
    { townId: 6, from: { x: 32358, y: 31777, z: 7 }, to: { x: 32364, y: 31787, z: 7 }, temple: { x: 32360, y: 31782, z: 7 } }, // Carlin
    { townId: 7, from: { x: 32642, y: 31921, z: 11 }, to: { x: 32656, y: 31929, z: 11 }, temple: { x: 32649, y: 31925, z: 11 } }, // Kazordoon
    { townId: 8, from: { x: 32365, y: 32231, z: 7 }, to: { x: 32374, y: 32243, z: 7 }, temple: { x: 32369, y: 32241, z: 7 } }, // Thais
    { townId: 9, from: { x: 32953, y: 32072, z: 7 }, to: { x: 32963, y: 32081, z: 7 }, temple: { x: 32957, y: 32076, z: 7 } }, // Venore
    { townId: 10, from: { x: 33188, y: 32844, z: 8 }, to: { x: 33201, y: 32857, z: 8 }, temple: { x: 33194, y: 32853, z: 8 } }, // Ankrahmun
    { townId: 11, from: { x: 33208, y: 31803, z: 8 }, to: { x: 33225, y: 31819, z: 8 }, temple: { x: 33217, y: 31814, z: 8 } }, // Edron
    { townId: 12, from: { x: 33018, y: 31514, z: 11 }, to: { x: 33032, y: 31531, z: 11 }, temple: { x: 33023, y: 31521, z: 11 } }, // Farmine
    { townId: 13, from: { x: 33210, y: 32450, z: 1 }, to: { x: 33217, y: 32457, z: 1 }, temple: { x: 33213, y: 32454, z: 1 } }, // Darashia
    { townId: 14, from: { x: 32313, y: 32818, z: 7 }, to: { x: 32322, y: 32830, z: 7 }, temple: { x: 32317, y: 32826, z: 7 } }, // Liberty Bay
    { townId: 15, from: { x: 32590, y: 32740, z: 7 }, to: { x: 32600, y: 32750, z: 7 }, temple: { x: 32594, y: 32745, z: 7 } }, // Port Hope
    { townId: 16, from: { x: 32209, y: 31130, z: 7 }, to: { x: 32215, y: 31136, z: 7 }, temple: { x: 32212, y: 31132, z: 7 } }, // Svargrond
    { townId: 17, from: { x: 32785, y: 31275, z: 7 }, to: { x: 32789, y: 31279, z: 7 }, temple: { x: 32787, y: 31276, z: 7 } }, // Yalahar
    { townId: 18, from: { x: 33444, y: 31313, z: 9 }, to: { x: 33452, y: 31324, z: 9 }, temple: { x: 33447, y: 31323, z: 9 } }, // Gray Beach
    { townId: 20, from: { x: 33586, y: 31895, z: 6 }, to: { x: 33602, y: 31902, z: 6 }, temple: { x: 33594, y: 31899, z: 6 } }, // Rathleton
    { townId: 21, from: { x: 33510, y: 32360, z: 6 }, to: { x: 33516, y: 32365, z: 6 }, temple: { x: 33513, y: 32363, z: 6 } }, // Roshamuul
    { townId: 22, from: { x: 33916, y: 31474, z: 5 }, to: { x: 33926, y: 31480, z: 5 }, temple: { x: 33921, y: 31477, z: 5 } }, // Issavi
  ];
