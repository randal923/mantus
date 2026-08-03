import type { SpellDefinition } from "./Spell";

type SpellArea = SpellDefinition["area"];

/**
 * Wheel-upgraded combat areas, transcribed from the pinned Canary
 * `data/scripts/lib/register_spells.lua` matrices with the same
 * centre-anchored decoding the spell importer uses. Each replaces the base
 * area when the owning augment or revelation reaches its grade.
 */

/** AREA_WAVE7 / AREADIAGONAL_WAVE7 — Energy Wave grade 2. */
export const WHEEL_AREA_WAVE7: SpellArea = {
  shape: "tiles",
  directional: true,
  offsets: [
    { x: -2, y: -4 }, { x: -1, y: -4 }, { x: 0, y: -4 }, { x: 1, y: -4 }, { x: 2, y: -4 },
    { x: -2, y: -3 }, { x: -1, y: -3 }, { x: 0, y: -3 }, { x: 1, y: -3 }, { x: 2, y: -3 },
    { x: -1, y: -2 }, { x: 0, y: -2 }, { x: 1, y: -2 },
    { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
    { x: 0, y: 0 },
  ],
  diagonalOffsets: [
    { x: -1, y: -6 },
    { x: -2, y: -5 }, { x: -1, y: -5 },
    { x: -3, y: -4 }, { x: -2, y: -4 }, { x: -1, y: -4 },
    { x: -4, y: -3 }, { x: -3, y: -3 }, { x: -2, y: -3 }, { x: -1, y: -3 },
    { x: -5, y: -2 }, { x: -4, y: -2 }, { x: -3, y: -2 }, { x: -2, y: -2 }, { x: -1, y: -2 },
    { x: -6, y: -1 }, { x: -5, y: -1 }, { x: -4, y: -1 }, { x: -3, y: -1 }, { x: -2, y: -1 }, { x: -1, y: -1 },
    { x: 0, y: 0 },
  ],
};

/** AREA_CIRCLE5X5 — Sap Strength grade 1 (sap_strength.lua:50-64). */
export const WHEEL_AREA_CIRCLE5X5: SpellArea = {
  shape: "tiles",
  directional: false,
  offsets: [
    { x: 0, y: -5 },
    { x: -1, y: -4 }, { x: 0, y: -4 }, { x: 1, y: -4 },
    { x: -2, y: -3 }, { x: -1, y: -3 }, { x: 0, y: -3 }, { x: 1, y: -3 }, { x: 2, y: -3 },
    { x: -3, y: -2 }, { x: -2, y: -2 }, { x: -1, y: -2 }, { x: 0, y: -2 }, { x: 1, y: -2 }, { x: 2, y: -2 }, { x: 3, y: -2 },
    { x: -4, y: -1 }, { x: -3, y: -1 }, { x: -2, y: -1 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 }, { x: 3, y: -1 }, { x: 4, y: -1 },
    { x: -5, y: 0 }, { x: -4, y: 0 }, { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 },
    { x: -4, y: 1 }, { x: -3, y: 1 }, { x: -2, y: 1 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 },
    { x: -3, y: 2 }, { x: -2, y: 2 }, { x: -1, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 },
    { x: -2, y: 3 }, { x: -1, y: 3 }, { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 },
    { x: -1, y: 4 }, { x: 0, y: 4 }, { x: 1, y: 4 },
    { x: 0, y: 5 },
  ],
};

/** AREA_BEAM7 / AREADIAGONAL_BEAM7 — Energy Beam with Beam Mastery. */
export const WHEEL_AREA_BEAM7: SpellArea = {
  shape: "tiles",
  directional: true,
  offsets: [
    { x: 0, y: -6 }, { x: 0, y: -5 }, { x: 0, y: -4 }, { x: 0, y: -3 },
    { x: 0, y: -2 }, { x: 0, y: -1 }, { x: 0, y: 0 },
  ],
  diagonalOffsets: [
    { x: -6, y: -6 }, { x: -5, y: -5 }, { x: -4, y: -4 }, { x: -3, y: -3 },
    { x: -2, y: -2 }, { x: -1, y: -1 }, { x: 0, y: 0 },
  ],
};

/** AREA_BEAM8 / AREADIAGONAL_BEAM8 — Great Death Beam grade 3. */
export const WHEEL_AREA_BEAM8: SpellArea = {
  shape: "tiles",
  directional: true,
  offsets: [
    { x: 0, y: -7 }, { x: 0, y: -6 }, { x: 0, y: -5 }, { x: 0, y: -4 },
    { x: 0, y: -3 }, { x: 0, y: -2 }, { x: 0, y: -1 }, { x: 0, y: 0 },
  ],
  diagonalOffsets: [
    { x: -7, y: -7 }, { x: -6, y: -6 }, { x: -5, y: -5 }, { x: -4, y: -4 },
    { x: -3, y: -3 }, { x: -2, y: -2 }, { x: -1, y: -1 }, { x: 0, y: 0 },
  ],
};

/** AREA_BEAM10 — Great Energy Beam with Beam Mastery (no diagonal form). */
export const WHEEL_AREA_BEAM10: SpellArea = {
  shape: "tiles",
  directional: true,
  offsets: [
    { x: 0, y: -9 }, { x: 0, y: -8 }, { x: 0, y: -7 }, { x: 0, y: -6 },
    { x: 0, y: -5 }, { x: 0, y: -4 }, { x: 0, y: -3 }, { x: 0, y: -2 },
    { x: 0, y: -1 }, { x: 0, y: 0 },
  ],
};
