import type { ProficiencyPerk } from "./ProficiencyProfile";

export interface ProficiencyPerkIcon {
  /** Sheet path under /assets, e.g. "ui/proficiency/icons-0.png". */
  readonly sheet: string;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  /** Clip origin of the 64×64 active icon; the grey row sits below it. */
  readonly x: number;
  readonly y: number;
  /** Y offset of the greyed-out variant inside the same or "-off" sheet. */
  readonly greySheet: string;
  readonly greyY: number;
  /** Optional 32×32 augment badge from augment-icons.png (active y 0, grey y 32). */
  readonly badgeX: number | null;
}

/**
 * Perk-family → icon-sheet mapping transcribed from OTClient
 * modules/game_proficiency/const.lua (PerkVisualData, SkillTypes,
 * SpellAugmentIcons, AugmentPerkIcons). Sheets hold 64×64 cells with the
 * active row at y 0 and the greyed row at y 64 (icons-9 has a separate
 * icons-9-off sheet). The art is display-only; effects stay server-side.
 */
const SKILL_X: Readonly<Record<string, number>> = {
  sword: 0,
  axe: 64,
  club: 128,
  fist: 192,
  magic: 256,
  shielding: 320,
  distance: 384,
  fishing: 448,
};

/** spellId → [x, y] inside icons-9 / icons-9-off (const.lua SpellAugmentIcons). */
const SPELL_XY: Readonly<Record<number, readonly [number, number]>> = {
  1: [0, 0], 2: [64, 0], 13: [128, 0], 19: [192, 0], 22: [192, 192],
  23: [256, 0], 24: [320, 0], 43: [384, 0], 57: [448, 0], 59: [512, 0],
  61: [576, 0], 62: [640, 0], 80: [704, 0], 84: [768, 0], 87: [832, 0],
  88: [896, 0], 89: [960, 0], 105: [1024, 0], 106: [1088, 0], 107: [1152, 0],
  112: [1216, 0], 113: [0, 64], 118: [64, 64], 119: [128, 64], 120: [192, 64],
  121: [256, 64], 122: [320, 64], 123: [384, 64], 124: [448, 64],
  125: [512, 64], 141: [576, 64], 148: [640, 64], 150: [704, 64],
  153: [768, 64], 154: [832, 64], 155: [896, 64], 156: [960, 64],
  157: [1024, 64], 158: [1088, 64], 169: [1152, 64], 173: [1216, 64],
  177: [0, 128], 178: [64, 128], 238: [128, 128], 240: [192, 128],
  258: [256, 128], 260: [320, 128], 261: [384, 128], 263: [448, 128],
  264: [512, 128], 265: [576, 128], 266: [640, 128], 267: [704, 128],
  268: [768, 128], 270: [832, 128], 271: [896, 128], 283: [960, 128],
  287: [1024, 128], 288: [1088, 128], 289: [1152, 128], 290: [1216, 128],
  292: [0, 192], 293: [64, 192], 294: [128, 192], 56: [256, 192],
};

/** augmentType → badge x inside augment-icons.png (const.lua AugmentPerkIcons). */
const AUGMENT_BADGE_X: Readonly<Record<number, number>> = {
  2: 192, 3: 192, 6: 160, 14: 352, 15: 384, 16: 224, 17: 224,
};

/** Bestiary class name → x inside icons-3 (const.lua BestiaryCategories). */
const BESTIARY_X: Readonly<Record<string, number>> = {
  Amphibic: 0, Aquatic: 64, Bird: 128, Construct: 192, Demon: 256,
  Dragon: 320, Elemental: 384, "Extra Dimensional": 1216, Fey: 448,
  Giant: 512, Human: 576, Humanoid: 640, Inkborn: 1280, Lycanthrope: 704,
  Magical: 768, Mammal: 832, Plant: 896, Reptile: 960, Slime: 1024,
  Undead: 1088, Vermin: 1152,
};

const SHEET_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  "icons-0": [1216, 128],
  "icons-1": [448, 128],
  "icons-2": [448, 128],
  "icons-3": [1344, 128],
  "icons-4": [512, 128],
  "icons-5": [512, 128],
  "icons-6": [512, 128],
  "icons-7": [512, 128],
  "icons-8": [448, 128],
  "icons-9": [1280, 256],
  "icons-9-off": [1280, 256],
  "icons-weaponmastery-elementalPiercing": [448, 128],
};

/** Perk-type slug → [sheet, x] for the fixed-cell families (PerkVisualData). */
const TYPE_CELL: Readonly<Record<string, readonly [string, number]>> = {
  "attack-damage": ["icons-0", 0],
  "defense-bonus": ["icons-0", 64],
  "weapon-shield-modifier": ["icons-0", 128],
  "powerful-foe-bonus": ["icons-0", 192],
  "critical-hit-chance": ["icons-0", 256],
  "rune-critical-hit-chance": ["icons-0", 320],
  "auto-attack-critical-hit-chance": ["icons-0", 384],
  "critical-extra-damage": ["icons-0", 448],
  "rune-critical-extra-damage": ["icons-0", 512],
  "auto-attack-critical-extra-damage": ["icons-0", 576],
  "life-leech": ["icons-0", 640],
  "mana-leech": ["icons-0", 704],
  "life-gain-on-hit": ["icons-0", 768],
  "mana-gain-on-hit": ["icons-0", 832],
  "life-gain-on-kill": ["icons-0", 896],
  "mana-gain-on-kill": ["icons-0", 960],
  "perfect-shot-damage": ["icons-0", 1024],
  "ranged-hit-chance": ["icons-0", 1088],
  "attack-range": ["icons-0", 1152],
  // const.lua maps these at x 1216/1280/1344, past our icons-0 sheet
  // (1216px wide); fall back to the generic attack cell.
  "alpha-strike-extra-damage": ["icons-0", 0],
  "omega-strike-extra-damage": ["icons-0", 0],
  "armor-penetration": ["icons-0", 0],
  "elemental-hit-chance": ["icons-2", 0],
  "elemental-critical-extra-damage": ["icons-1", 0],
  "elemental-pierce": ["icons-weaponmastery-elementalPiercing", 0],
  "specialized-magic-level": ["icons-8", 0],
};

function build(
  sheetName: string,
  x: number,
  y: number,
  badgeX: number | null,
): ProficiencyPerkIcon {
  const [sheetWidth, sheetHeight] = SHEET_SIZES[sheetName] ?? [1216, 128];
  const greySheet =
    sheetName === "icons-9"
      ? "ui/proficiency/icons-9-off.png"
      : `ui/proficiency/${sheetName}.png`;
  return {
    sheet: `ui/proficiency/${sheetName}.png`,
    sheetWidth,
    sheetHeight,
    x,
    y,
    greySheet,
    greyY: sheetName === "icons-9" ? y : y + 64,
    badgeX,
  };
}

/** Icon clip for one perk-table entry; falls back to the attack icon. */
export function getProficiencyPerkIcon(
  perk: ProficiencyPerk,
): ProficiencyPerkIcon {
  if (perk.type === "spell-augment") {
    const [x, y] = SPELL_XY[perk.spellId ?? -1] ?? [0, 0];
    const badgeX =
      perk.augmentType !== undefined
        ? (AUGMENT_BADGE_X[perk.augmentType] ?? null)
        : null;
    return build("icons-9", x, y, badgeX);
  }
  if (perk.type === "skill-bonus") {
    return build("icons-7", SKILL_X[perk.skill ?? ""] ?? 0, 0, null);
  }
  if (perk.type === "skill-percentage-auto-attack") {
    return build("icons-4", SKILL_X[perk.skill ?? ""] ?? 0, 0, null);
  }
  if (perk.type === "skill-percentage-spell-damage") {
    return build("icons-5", SKILL_X[perk.skill ?? ""] ?? 0, 0, null);
  }
  if (perk.type === "skill-percentage-spell-healing") {
    return build("icons-6", SKILL_X[perk.skill ?? ""] ?? 0, 0, null);
  }
  if (perk.type === "bestiary-damage") {
    return build("icons-3", BESTIARY_X[perk.bestiaryName ?? ""] ?? 0, 0, null);
  }
  const [sheetName, x] = TYPE_CELL[perk.type] ?? ["icons-0", 0];
  return build(sheetName, x, 0, null);
}
