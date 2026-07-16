import type { CharacterVocation } from "@tibia/protocol";

const SPELLS = [
  {
    id: "light-healing",
    nameKey: "lightHealing",
    glyph: "✚",
    manaCost: 20,
    cooldownGroup: "healing",
    requiredLevel: 1,
    target: "self",
    vocations: null,
  },
  {
    id: "energy-strike",
    nameKey: "energyStrike",
    glyph: "ϟ",
    manaCost: 6,
    cooldownGroup: "attack",
    requiredLevel: 1,
    target: "attack-target",
    vocations: ["Sorcerer", "Druid", "Master Sorcerer", "Elder Druid"],
  },
  {
    id: "ice-wave",
    nameKey: "iceWave",
    glyph: "❄",
    manaCost: 25,
    cooldownGroup: "attack",
    requiredLevel: 8,
    target: "attack-target",
    vocations: ["Druid", "Elder Druid"],
  },
  {
    id: "fire-bomb",
    nameKey: "fireBomb",
    glyph: "✦",
    manaCost: 85,
    cooldownGroup: "attack",
    requiredLevel: 15,
    target: "attack-target",
    vocations: ["Sorcerer", "Druid", "Master Sorcerer", "Elder Druid"],
  },
  {
    id: "haste",
    nameKey: "haste",
    glyph: "»",
    manaCost: 60,
    cooldownGroup: "support",
    requiredLevel: 14,
    target: "self",
    vocations: null,
  },
  {
    id: "magic-shield",
    nameKey: "magicShield",
    glyph: "◇",
    manaCost: 50,
    cooldownGroup: "support",
    requiredLevel: 14,
    target: "self",
    vocations: ["Sorcerer", "Druid", "Master Sorcerer", "Elder Druid"],
  },
  {
    id: "ultimate-healing",
    nameKey: "ultimateHealing",
    glyph: "✥",
    manaCost: 160,
    cooldownGroup: "healing",
    requiredLevel: 20,
    target: "self",
    vocations: null,
  },
  {
    id: "front-sweep",
    nameKey: "frontSweep",
    glyph: "⌁",
    manaCost: 20,
    cooldownGroup: "attack",
    requiredLevel: 8,
    target: "attack-target",
    vocations: ["Knight", "Elite Knight"],
  },
  {
    id: "holy-strike",
    nameKey: "holyStrike",
    glyph: "✧",
    manaCost: 20,
    cooldownGroup: "attack",
    requiredLevel: 8,
    target: "attack-target",
    vocations: ["Paladin", "Royal Paladin"],
  },
] as const;

export function getCombatSpells(vocation: CharacterVocation) {
  return SPELLS.filter(
    (spell) =>
      spell.vocations === null ||
      (spell.vocations as ReadonlyArray<CharacterVocation>).includes(vocation),
  ).map((spell, index) => ({
    ...spell,
    shortcut: String(index + 1),
  }));
}
