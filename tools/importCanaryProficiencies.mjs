import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Transcribes Canary's data/items/proficiencies.json (weapon proficiency
// perk tables, PR #3845) into typed content the server validates selections
// against and a public client asset for rendering. Perk `Type` follows
// src/enums/weapon_proficiency.hpp (0..31); `SkillId` is CipbiaSkills_t
// (1 magic, 6 shield, 7 distance, 8 sword, 9 club, 10 axe, 11 fist,
// 13 fishing).

const repoRoot = resolve(import.meta.dirname, "..");
const canaryPath = process.argv[2] ?? process.env.CANARY_PATH;
if (!canaryPath) {
  throw new Error(
    "usage: node tools/importCanaryProficiencies.mjs <canary-checkout>",
  );
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const pinnedCommit = manifest.canary.commit;
const checkoutCommit = execFileSync("git", ["-C", canaryPath, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (checkoutCommit !== pinnedCommit) {
  throw new Error(
    `canary checkout is at ${checkoutCommit}, but the manifest pins ${pinnedCommit}`,
  );
}

const sourcePath = join(canaryPath, "data/items/proficiencies.json");
const raw = await readFile(sourcePath);
const source = JSON.parse(raw.toString("utf8"));
if (!Array.isArray(source)) throw new Error("proficiencies.json is not a list");

const PERK_TYPE_NAMES = {
  0: "attack-damage",
  1: "defense-bonus",
  2: "weapon-shield-modifier",
  3: "skill-bonus",
  4: "specialized-magic-level",
  5: "spell-augment",
  6: "bestiary-damage",
  7: "powerful-foe-bonus",
  8: "critical-hit-chance",
  9: "elemental-hit-chance",
  10: "rune-critical-hit-chance",
  11: "auto-attack-critical-hit-chance",
  12: "critical-extra-damage",
  13: "elemental-critical-extra-damage",
  14: "rune-critical-extra-damage",
  15: "auto-attack-critical-extra-damage",
  16: "mana-leech",
  17: "life-leech",
  18: "mana-gain-on-hit",
  19: "life-gain-on-hit",
  20: "mana-gain-on-kill",
  21: "life-gain-on-kill",
  22: "perfect-shot-damage",
  23: "ranged-hit-chance",
  24: "attack-range",
  25: "skill-percentage-auto-attack",
  26: "skill-percentage-spell-damage",
  27: "skill-percentage-spell-healing",
  28: "alpha-strike-extra-damage",
  29: "omega-strike-extra-damage",
  30: "armor-penetration",
  31: "elemental-pierce",
};

const CIPBIA_SKILLS = {
  1: "magic",
  6: "shielding",
  7: "distance",
  8: "sword",
  9: "club",
  10: "axe",
  11: "fist",
  13: "fishing",
};

// Canary registerLevels/registerPerks caps (configmanager defaults).
const MAX_LEVELS = 10;
const MAX_PERKS_PER_LEVEL = 6;

const profiles = [];
for (const entry of source) {
  const id = entry.ProficiencyId;
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`proficiency entry has invalid id ${id}`);
  }
  const levels = [];
  for (const level of (entry.Levels ?? []).slice(0, MAX_LEVELS)) {
    const perks = [];
    for (const perk of (level.Perks ?? []).slice(0, MAX_PERKS_PER_LEVEL)) {
      const typeName = PERK_TYPE_NAMES[perk.Type];
      if (!typeName) throw new Error(`proficiency ${id} has unknown perk type ${perk.Type}`);
      perks.push({
        type: typeName,
        value: perk.Value ?? 0,
        ...(perk.SkillId !== undefined
          ? { skill: CIPBIA_SKILLS[perk.SkillId] ?? `cipbia-${perk.SkillId}` }
          : {}),
        ...(perk.SpellId !== undefined ? { spellId: perk.SpellId } : {}),
        ...(perk.AugmentType !== undefined
          ? { augmentType: perk.AugmentType }
          : {}),
        ...(perk.Element !== undefined ? { element: perk.Element } : {}),
        ...(perk.Range !== undefined ? { range: perk.Range } : {}),
        ...(perk.BestiaryId !== undefined ? { bestiaryId: perk.BestiaryId } : {}),
        ...(perk.BestiaryName !== undefined
          ? { bestiaryName: perk.BestiaryName }
          : {}),
      });
    }
    levels.push({ perks });
  }
  profiles.push({
    proficiencyId: id,
    name: String(entry.Name ?? `proficiency ${id}`),
    version: entry.Version ?? 0,
    levels,
  });
}
profiles.sort((a, b) => a.proficiencyId - b.proficiencyId);

const document = {
  formatVersion: 1,
  source: {
    canaryCommit: pinnedCommit,
    path: "data/items/proficiencies.json",
    sha256: createHash("sha256").update(raw).digest("hex"),
  },
  profiles,
};

const serialized = `${JSON.stringify(document, null, 1)}\n`;
await writeFile(join(repoRoot, "content/proficiencies.json"), serialized);
await writeFile(
  join(repoRoot, "client/public/assets/proficiencies.json"),
  serialized,
);
console.log(`imported ${profiles.length} weapon proficiency profiles`);
