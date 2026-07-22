// Imports Canary creature definitions and placements from a pinned checkout.
// Canary Lua is read as text and only whitelisted literal assignments are parsed.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { parseCanaryCreatureContent } from "./parseCanaryCreatureContent.mjs";
import { parseCanaryMonsterSpells } from "./parseCanaryMonsterSpells.mjs";

const repoRoot = join(import.meta.dirname, "..");
const canaryRoot = process.argv.find((argument, index) =>
  index >= 2 && !argument.startsWith("--")
) ?? process.env.CANARY_PATH;
const starterOnly = process.argv.includes("--starter");
const contentName = starterOnly ? "starter" : "world";
if (!canaryRoot) {
  throw new Error(
    "usage: node tools/importCanaryCreatures.mjs <pinned-canary-checkout>",
  );
}

const manifest = JSON.parse(
  readFileSync(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const source = manifest.sources.canaryCreatures;
if (!source || manifest.converters.creatures !== 2) {
  throw new Error("source manifest has no supported Canary creature source");
}
const commit = execFileSync("git", ["-C", canaryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (commit !== source.commit) {
  throw new Error(`Canary checkout is ${commit}, expected ${source.commit}`);
}

const worldDir = join(canaryRoot, "data-otservbr-global/world");
const monsterDir = join(canaryRoot, "data-otservbr-global/monster");
const npcDir = join(canaryRoot, "data-otservbr-global/npc");
const mapContent = JSON.parse(
  readFileSync(join(repoRoot, "server/data/otservbr.content.json"), "utf8"),
);
if (mapContent.source.mapSha256 !== manifest.sources.map.sha256) {
  throw new Error("converted map content does not match the pinned OTBM");
}
const monsterFilename = safeFilename(mapContent.otbm?.monsterSpawnFile, "monster");
const npcFilename = safeFilename(mapContent.otbm?.npcSpawnFile, "NPC");
const monsterSpawnXml = readFileSync(join(worldDir, monsterFilename), "utf8");
const npcSpawnXml = readFileSync(join(worldDir, npcFilename), "utf8");
assertHash(monsterSpawnXml, source.monsterSpawnsSha256, monsterFilename);
assertHash(npcSpawnXml, source.npcSpawnsSha256, npcFilename);

const monsterDefinitions = readDefinitions(monsterDir);
const npcDefinitions = readDefinitions(npcDir);
const monsterSpellSources = [
  ...readDefinitions(join(canaryRoot, "data-otservbr-global/scripts/spells")),
  ...readDefinitions(join(canaryRoot, "data/scripts/spells")),
  ...readDefinitions(join(canaryRoot, "data/scripts/runes")),
];
const constantsSource = readFileSync(
  join(canaryRoot, "src/utils/utils_definitions.hpp"),
  "utf8",
);
const areasSource = readFileSync(
  join(canaryRoot, "data/scripts/lib/register_spells.lua"),
  "utf8",
);
const monsterSpells = parseCanaryMonsterSpells(
  monsterSpellSources,
  parseConstants(constantsSource),
  parseAreas(areasSource),
);
const navigation = readNavigation(join(repoRoot, "server/data/otservbr.map.bin"));
const bounds = starterOnly
  ? { centerX: 32369, centerY: 32241, z: 7, radius: 48 }
  : null;
const parsed = parseCanaryCreatureContent({
  monsterSpawnXml,
  npcSpawnXml,
  monsterDefinitions,
  npcDefinitions,
  monsterSpells,
  additionalMonsterTypeIds: starterOnly
    ? []
    : [
        "raging-mage",
        "enraged-white-deer",
        "desperate-white-deer",
        "snake-thing",
        "lizard-abomination",
        "mutated-zalamon",
        "ugly-monster",
        "druid-s-apparition",
        "knight-s-apparition",
        "paladin-s-apparition",
        "sorcerer-s-apparition",
        "monk-s-apparition",
        "greater-splinter-of-madness",
        "mighty-splinter-of-madness",
      ],
  bounds,
  tileAt: navigation.tileAt,
});
const appearanceValidation = validateAppearances(parsed, manifest);
const definitionHash = createHash("sha256")
  .update(
    [...monsterDefinitions, ...npcDefinitions]
      .map((definition) => `${definition.path}\0${definition.source}`)
      .sort()
      .join("\0"),
  )
  .digest("hex");
const monsterSpellsHash = createHash("sha256")
  .update(
    [
      ...monsterSpellSources.map(
        (definition) => `${definition.path}\0${definition.source}`,
      ),
      `src/utils/utils_definitions.hpp\0${constantsSource}`,
      `data/scripts/lib/register_spells.lua\0${areasSource}`,
    ].sort().join("\0"),
  )
  .digest("hex");
const provenance = {
  canaryCommit: commit,
  monsterSpawnsSha256: source.monsterSpawnsSha256,
  npcSpawnsSha256: source.npcSpawnsSha256,
  definitionsSha256: definitionHash,
  monsterSpellsSha256: monsterSpellsHash,
};
const staging = join(repoRoot, `.creature-staging-${process.pid}`);
rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, "monsters"), { recursive: true });
mkdirSync(join(staging, "npcs"), { recursive: true });
mkdirSync(join(staging, "spawns"), { recursive: true });
writeJson(join(staging, `monsters/${contentName}-monsters.json`), {
  formatVersion: manifest.converters.creatures,
  source: provenance,
  types: parsed.monsterTypes,
});
writeJson(join(staging, `npcs/${contentName}-npcs.json`), {
  formatVersion: manifest.converters.creatures,
  source: provenance,
  types: parsed.npcTypes,
});
writeJson(join(staging, `spawns/${contentName}-spawns.json`), {
  formatVersion: manifest.converters.creatures,
  source: provenance,
  map: mapContent.name,
  bounds,
  restartSemantics:
    "Ordinary spawn deadlines are ephemeral and reset when the process restarts.",
  activationSemantics:
    "Nearby players activate empty slots; creatures outside every player's activation range retain identity and state while dormant, then reactivate at their last position.",
  slots: parsed.slots,
});
writeJson(join(staging, `spawns/${contentName}-import-report.json`), {
  formatVersion: manifest.converters.creatures,
  source: provenance,
  mapExternalFiles: { monsters: monsterFilename, npcs: npcFilename },
  appearanceValidation,
  bounds,
  ...parsed.report,
  unsupportedDefinitions: parsed.report.unsupportedDefinitions.map(
    addGapOwnership,
  ),
});
for (const directory of ["monsters", "npcs", "spawns"]) {
  const target = join(repoRoot, "content", directory);
  const replacement = join(staging, directory);
  mkdirSync(target, { recursive: true });
  for (const filename of readdirSync(replacement)) {
    renameSync(join(replacement, filename), join(target, filename));
  }
}
rmSync(staging, { recursive: true, force: true });
console.log(
  `imported ${parsed.monsterTypes.length} monster types, ${parsed.npcTypes.length} NPC types, and ${parsed.slots.length} ${contentName} spawn slots`,
);

function safeFilename(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`OTBM ${label} spawn filename is missing or unsafe`);
  }
  return value;
}

function assertHash(value, expected, label) {
  const actual = createHash("sha256").update(value).digest("hex");
  if (actual !== expected) throw new Error(`${label} hash ${actual} is not pinned`);
}

function validateAppearances(parsed, manifest) {
  const assetDocument = JSON.parse(
    readFileSync(join(repoRoot, "client/public/assets/objects.json"), "utf8"),
  );
  if (assetDocument.formatVersion !== manifest.converters.assets) {
    throw new Error("creature import requires the current converted asset format");
  }
  if (
    assetDocument.source?.datSha256 !== manifest.sources.dat.sha256 ||
    assetDocument.source?.sprSha256 !== manifest.sources.spr.sha256
  ) {
    throw new Error("creature appearances do not match the pinned client assets");
  }
  const appearances = new Set(
    assetDocument.objects.map((object) => `${object.category}:${object.clientId}`),
  );
  let outfits = 0;
  let items = 0;
  let intentionallyInvisible = 0;
  for (const type of [...parsed.monsterTypes, ...parsed.npcTypes]) {
    if (type.outfit.lookType > 0) {
      if (!appearances.has(`outfit:${type.outfit.lookType}`)) {
        throw new Error(`${type.id} references missing outfit ${type.outfit.lookType}`);
      }
      outfits++;
      continue;
    }
    if (type.outfit.lookTypeEx) {
      if (!appearances.has(`item:${type.outfit.lookTypeEx}`)) {
        throw new Error(`${type.id} references missing item ${type.outfit.lookTypeEx}`);
      }
      items++;
      continue;
    }
    intentionallyInvisible++;
  }
  return { outfits, items, intentionallyInvisible };
}

function readDefinitions(directory) {
  const definitions = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      definitions.push(...readDefinitions(path));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".lua")) continue;
    definitions.push({
      path: relative(canaryRoot, path).replaceAll("\\", "/"),
      source: readFileSync(path, "utf8"),
    });
  }
  return definitions.sort((left, right) => left.path.localeCompare(right.path));
}

function parseConstants(source) {
  const constants = {};
  for (const match of source.matchAll(
    /^\s*(CONST_(?:ME|ANI)_[A-Z0-9_]+)\s*=\s*(\d+)\s*,/gm,
  )) {
    constants[match[1]] = Number(match[2]);
  }
  return constants;
}

function parseAreas(source) {
  const areas = {};
  for (const match of source.matchAll(
    /^((?:AREA_|AREADIAGONAL_)[A-Z0-9_]+)\s*=\s*\{([\s\S]*?)^}/gm,
  )) {
    const rows = [...match[2].matchAll(/{\s*([0-3,\s]+)\s*}/g)].map(
      (row) =>
        row[1]
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isInteger(value)),
    );
    const centerY = rows.findIndex((row) => row.includes(3) || row.includes(2));
    const centerX = rows[centerY]?.findIndex(
      (value) => value === 3 || value === 2,
    ) ?? -1;
    if (centerX < 0 || centerY < 0) continue;
    areas[match[1]] = rows.flatMap((row, y) =>
      row.flatMap((value, x) =>
        value === 1 || value === 3
          ? [{ x: x - centerX, y: y - centerY }]
          : [],
      ),
    );
  }
  return areas;
}

function addGapOwnership(definition) {
  return {
    ...definition,
    gaps: [
      ...definition.ignoredAssignments.map((name) =>
        creatureGap(definition.kind, "field", name),
      ),
      ...definition.proceduralCallbacks.map((name) =>
        creatureGap(definition.kind, "callback", name),
      ),
    ],
  };
}

function creatureGap(kind, gapKind, name) {
  const blockedBy = creatureGapOwner(kind, name);
  return {
    kind: gapKind,
    name,
    ownerTodo:
      kind === "npc" && blockedBy === "10-npcs"
        ? "10-npcs"
        : "04-creatures-spawns-and-ai",
    status: "blocked",
    blockedBy,
    reason:
      blockedBy === "04-creatures-spawns-and-ai" ||
      blockedBy === "07-combat"
        ? "Dependency-ready typed creature behavior remains to be implemented in the owning early workstream."
        : `Requires ${blockedBy} before this imported creature behavior can be completed.`,
  };
}

function creatureGapOwner(kind, name) {
  if (
    ["Bestiary", "bosstiary", "race", "raceId"].includes(name) ||
    name.startsWith("flags.rewardBoss") ||
    name.startsWith("flags.isPrey") ||
    name.startsWith("flags.forge")
  ) {
    return "15-optional-features";
  }
  if (name === "voices.runtime") return "09-chat";
  if (
    name.startsWith("flags.canWalkOn") ||
    name.startsWith("flags.isBlockable")
  ) {
    return "08c-decay";
  }
  if (
    name.startsWith("attacks.registeredSpell:") ||
    name.startsWith("defenses.registeredSpell:")
  ) {
    return "07-combat";
  }
  if (
    ["shop", "currency", "moneyToNeedDonation"].includes(name) ||
    ["onBuyItem", "onSellItem", "onCheckItem"].includes(name)
  ) {
    return "11b-npc-shops";
  }
  if (kind === "npc") return "10-npcs";
  if (["events"].includes(name)) return "12-world-actions";
  if (
    [
      "enemyFactions",
      "faction",
      "heals",
      "maxSummons",
      "reflects",
      "summon",
    ].includes(name)
  ) {
    return "07-combat";
  }
  return "04-creatures-spawns-and-ai";
}

function readNavigation(path) {
  const buffer = readFileSync(path);
  if (buffer.toString("ascii", 0, 4) !== "TMAP" || buffer.readUInt8(4) !== 3) {
    throw new Error("creature import requires version 3 TMAP navigation data");
  }
  const sectorSize = buffer.readUInt8(5);
  const sectorCount = buffer.readUInt32LE(8);
  const bitsetBytes = (sectorSize * sectorSize) / 8;
  const entrySize = 5 + bitsetBytes * 10 + (sectorSize * sectorSize * 5) / 8;
  if (buffer.length !== 12 + sectorCount * entrySize) {
    throw new Error("TMAP navigation length does not match its sector count");
  }
  const sectors = new Map();
  let offset = 12;
  for (let index = 0; index < sectorCount; index++) {
    const x = buffer.readUInt16LE(offset);
    const y = buffer.readUInt16LE(offset + 2);
    const z = buffer.readUInt8(offset + 4);
    const present = buffer.subarray(offset + 5, offset + 5 + bitsetBytes);
    const walkable = buffer.subarray(
      offset + 5 + bitsetBytes,
      offset + 5 + bitsetBytes * 2,
    );
    sectors.set(`${x},${y},${z}`, { present, walkable });
    offset += entrySize;
  }
  return {
    tileAt(position) {
      const sector = sectors.get(
        `${Math.floor(position.x / sectorSize)},${Math.floor(position.y / sectorSize)},${position.z}`,
      );
      if (!sector) return "missing";
      const bit = (position.y % sectorSize) * sectorSize + (position.x % sectorSize);
      const present = (sector.present[bit >> 3] & (1 << (bit & 7))) !== 0;
      if (!present) return "missing";
      const walkable = (sector.walkable[bit >> 3] & (1 << (bit & 7))) !== 0;
      return walkable ? "walkable" : "blocked";
    },
  };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  if (statSync(path).size === 0) throw new Error(`failed to write ${path}`);
}
