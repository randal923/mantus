import type { Position } from "@tibia/protocol";

/**
 * The four elemental shrine portals that stand in every city (Canary
 * `movements/teleport/shrine_entrance.lua` / `shrine_exit.lua`). Each city has
 * one flame per element; stepping into one carries a level-30 character to that
 * element's shrine and remembers the city, and the flames inside the shrine
 * bring them back to the city they came from.
 *
 * The shrine flames carry no OTBM teleport destination at all — Canary
 * registers these MoveEvents on bare positions — so the map converter never
 * sees them and they are dead tiles until this table drives them.
 */
export type ShrineElement = "ice" | "earth" | "fire" | "energy";

export interface ElementalShrineEntrance {
  readonly position: Position;
  /** 1-based city index, shared by all four elements and by the way back. */
  readonly cityIndex: number;
  readonly element: ShrineElement;
}

/** Canary: `if player:getLevel() < 30 then` push the stepper straight back. */
export const ELEMENTAL_SHRINE_LEVEL = 30;

export const ELEMENTAL_SHRINE_MESSAGE =
  "Only players of level 30 or higher may enter this portal.";

/** Canary `Storage.ShrineEntrance` (30060): the city to return the player to. */
export const ELEMENTAL_SHRINE_STORAGE_KEY = "ShrineEntrance";

export const ELEMENTAL_SHRINE_DESTINATIONS: Readonly<
  Record<ShrineElement, Position>
> = {
  ice: { x: 32_192, y: 31_419, z: 2 },
  earth: { x: 32_972, y: 32_227, z: 7 },
  fire: { x: 32_911, y: 32_336, z: 15 },
  energy: { x: 33_059, y: 32_716, z: 5 },
};

export const ELEMENTAL_SHRINE_ENTRANCES: ReadonlyArray<ElementalShrineEntrance> =
  [
    { position: { x: 32_356, y: 31_780, z: 9 }, cityIndex: 1, element: "ice" }, // Carlin
    { position: { x: 32_358, y: 32_242, z: 6 }, cityIndex: 2, element: "ice" }, // Thais
    { position: { x: 32_954, y: 32_076, z: 5 }, cityIndex: 3, element: "ice" }, // Venore
    { position: { x: 32_678, y: 31_688, z: 2 }, cityIndex: 4, element: "ice" }, // Ab'Dendriel
    { position: { x: 32_643, y: 31_928, z: 11 }, cityIndex: 5, element: "ice" }, // Kazordoon
    { position: { x: 33_229, y: 32_389, z: 5 }, cityIndex: 6, element: "ice" }, // Darashia
    { position: { x: 33_126, y: 32_812, z: 4 }, cityIndex: 7, element: "ice" }, // Ankrahmun
    { position: { x: 33_264, y: 31_837, z: 9 }, cityIndex: 8, element: "ice" }, // Edron
    { position: { x: 32_333, y: 32_838, z: 8 }, cityIndex: 9, element: "ice" }, // Liberty Bay
    { position: { x: 32_624, y: 32_744, z: 4 }, cityIndex: 10, element: "ice" }, // Port Hope
    { position: { x: 32_212, y: 31_130, z: 8 }, cityIndex: 11, element: "ice" }, // Svargrond
    { position: { x: 32_784, y: 31_243, z: 5 }, cityIndex: 12, element: "ice" }, // Yalahar
    { position: { x: 33_592, y: 31_896, z: 4 }, cityIndex: 13, element: "ice" }, // Oramond
    { position: { x: 32_364, y: 31_780, z: 9 }, cityIndex: 1, element: "earth" },
    { position: { x: 32_360, y: 32_239, z: 6 }, cityIndex: 2, element: "earth" },
    { position: { x: 32_958, y: 32_079, z: 5 }, cityIndex: 3, element: "earth" },
    { position: { x: 32_678, y: 31_686, z: 2 }, cityIndex: 4, element: "earth" },
    { position: { x: 32_649, y: 31_928, z: 11 }, cityIndex: 5, element: "earth" },
    { position: { x: 33_232, y: 32_389, z: 5 }, cityIndex: 6, element: "earth" },
    { position: { x: 33_131, y: 32_806, z: 4 }, cityIndex: 7, element: "earth" },
    { position: { x: 33_266, y: 31_831, z: 9 }, cityIndex: 8, element: "earth" },
    { position: { x: 32_339, y: 32_842, z: 8 }, cityIndex: 9, element: "earth" },
    { position: { x: 32_625, y: 32_740, z: 4 }, cityIndex: 10, element: "earth" },
    { position: { x: 32_215, y: 31_130, z: 8 }, cityIndex: 11, element: "earth" },
    { position: { x: 32_787, y: 31_243, z: 5 }, cityIndex: 12, element: "earth" },
    { position: { x: 33_596, y: 31_901, z: 4 }, cityIndex: 13, element: "earth" },
    { position: { x: 32_356, y: 31_783, z: 9 }, cityIndex: 1, element: "fire" },
    { position: { x: 32_379, y: 32_242, z: 6 }, cityIndex: 2, element: "fire" },
    { position: { x: 32_961, y: 32_076, z: 5 }, cityIndex: 3, element: "fire" },
    { position: { x: 32_678, y: 31_684, z: 2 }, cityIndex: 4, element: "fire" },
    { position: { x: 32_649, y: 31_921, z: 11 }, cityIndex: 5, element: "fire" },
    { position: { x: 33_235, y: 32_389, z: 5 }, cityIndex: 6, element: "fire" },
    { position: { x: 33_126, y: 32_820, z: 4 }, cityIndex: 7, element: "fire" },
    { position: { x: 33_271, y: 31_831, z: 9 }, cityIndex: 8, element: "fire" },
    { position: { x: 32_343, y: 32_838, z: 8 }, cityIndex: 9, element: "fire" },
    { position: { x: 32_632, y: 32_740, z: 4 }, cityIndex: 10, element: "fire" },
    { position: { x: 32_208, y: 31_133, z: 8 }, cityIndex: 11, element: "fire" },
    { position: { x: 32_790, y: 31_243, z: 5 }, cityIndex: 12, element: "fire" },
    { position: { x: 33_592, y: 31_901, z: 4 }, cityIndex: 13, element: "fire" },
    { position: { x: 32_364, y: 31_783, z: 9 }, cityIndex: 1, element: "energy" },
    { position: { x: 32_377, y: 32_239, z: 6 }, cityIndex: 2, element: "energy" },
    { position: { x: 32_958, y: 32_072, z: 5 }, cityIndex: 3, element: "energy" },
    { position: { x: 32_681, y: 31_683, z: 2 }, cityIndex: 4, element: "energy" },
    { position: { x: 32_643, y: 31_921, z: 11 }, cityIndex: 5, element: "energy" },
    { position: { x: 33_226, y: 32_389, z: 5 }, cityIndex: 6, element: "energy" },
    { position: { x: 33_131, y: 32_823, z: 4 }, cityIndex: 7, element: "energy" },
    { position: { x: 33_271, y: 31_837, z: 9 }, cityIndex: 8, element: "energy" },
    { position: { x: 32_339, y: 32_832, z: 8 }, cityIndex: 9, element: "energy" },
    { position: { x: 32_632, y: 32_744, z: 4 }, cityIndex: 10, element: "energy" },
    { position: { x: 32_209, y: 31_130, z: 8 }, cityIndex: 11, element: "energy" },
    { position: { x: 32_781, y: 31_243, z: 5 }, cityIndex: 12, element: "energy" },
    { position: { x: 33_596, y: 31_896, z: 4 }, cityIndex: 13, element: "energy" },
  ];

/** The flames inside the four shrines, all of which lead back to a city. */
export const ELEMENTAL_SHRINE_EXITS: ReadonlyArray<Position> = [
  { x: 32_191, y: 31_419, z: 2 }, // ice
  { x: 32_197, y: 31_419, z: 2 },
  { x: 32_971, y: 32_224, z: 7 }, // earth
  { x: 32_977, y: 32_224, z: 7 },
  { x: 32_971, y: 32_228, z: 7 },
  { x: 32_977, y: 32_228, z: 7 },
  { x: 32_914, y: 32_337, z: 15 }, // fire
  { x: 32_914, y: 32_342, z: 15 },
  { x: 32_907, y: 32_337, z: 15 },
  { x: 32_907, y: 32_342, z: 15 },
  { x: 33_063, y: 32_711, z: 5 }, // energy
  { x: 33_063, y: 32_716, z: 5 },
  { x: 33_059, y: 32_717, z: 5 },
];

/** Where each city's shrine flame drops the player on the way back, by index. */
export const ELEMENTAL_SHRINE_RETURNS: ReadonlyArray<Position> = [
  { x: 32_360, y: 31_781, z: 9 }, // 1 Carlin
  { x: 32_369, y: 32_242, z: 6 }, // 2 Thais
  { x: 32_958, y: 32_077, z: 5 }, // 3 Venore
  { x: 32_681, y: 31_686, z: 2 }, // 4 Ab'Dendriel
  { x: 32_646, y: 31_925, z: 11 }, // 5 Kazordoon
  { x: 33_230, y: 32_392, z: 5 }, // 6 Darashia
  { x: 33_130, y: 32_815, z: 4 }, // 7 Ankrahmun
  { x: 33_266, y: 31_835, z: 9 }, // 8 Edron
  { x: 32_337, y: 32_837, z: 8 }, // 9 Liberty Bay
  { x: 32_628, y: 32_743, z: 4 }, // 10 Port Hope
  { x: 32_213, y: 31_132, z: 8 }, // 11 Svargrond
  { x: 32_786, y: 31_245, z: 5 }, // 12 Yalahar
  { x: 33_594, y: 31_899, z: 4 }, // 13 Oramond
];
