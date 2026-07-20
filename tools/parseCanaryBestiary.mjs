// Parses bestiary/bosstiary metadata out of Canary monster Lua sources.
// Lua is read as text; only whitelisted literal assignments are extracted.

const BOSS_CATEGORIES = {
  RARITY_BANE: "bane",
  RARITY_ARCHFOE: "archfoe",
  RARITY_NEMESIS: "nemesis",
};

const BESTIARY_CLASSES = new Set([
  "Amphibic",
  "Aquatic",
  "Bird",
  "Construct",
  "Demon",
  "Dragon",
  "Elemental",
  "Extra Dimensional",
  "Fey",
  "Giant",
  "Human",
  "Humanoid",
  "Lycanthrope",
  "Magical",
  "Mammal",
  "Plant",
  "Reptile",
  "Slime",
  "Undead",
  "Vermin",
  "Inkborn",
]);

export function parseCanaryBestiary(luaSource, sourcePath) {
  const nameMatch = luaSource.match(
    /Game\.createMonsterType\("((?:[^"\\]|\\.)*)"\)/,
  );
  if (!nameMatch) {
    return { name: null, bestiary: null, bosstiary: null, warnings: [] };
  }
  const name = unescapeLua(nameMatch[1]);
  const warnings = [];
  const raceIdMatch = luaSource.match(/^monster\.raceId\s*=\s*(\d+)\s*$/m);

  let bestiary = null;
  const bestiaryBlock = extractBlock(luaSource, "monster.Bestiary");
  if (bestiaryBlock) {
    const klass = readString(bestiaryBlock, "class");
    const toKill = readNumber(bestiaryBlock, "toKill");
    const firstUnlock = readNumber(bestiaryBlock, "FirstUnlock");
    const secondUnlock = readNumber(bestiaryBlock, "SecondUnlock");
    const charmPoints = readNumber(bestiaryBlock, "CharmsPoints");
    const stars = readNumber(bestiaryBlock, "Stars");
    const occurrence = readNumber(bestiaryBlock, "Occurrence");
    const locations = readString(bestiaryBlock, "Locations");
    if (!raceIdMatch) {
      warnings.push(`${sourcePath}: Bestiary block without monster.raceId`);
    } else if (
      klass === null ||
      !BESTIARY_CLASSES.has(klass) ||
      toKill === null ||
      firstUnlock === null ||
      secondUnlock === null ||
      charmPoints === null ||
      stars === null ||
      occurrence === null
    ) {
      warnings.push(`${sourcePath}: incomplete Bestiary block`);
    } else if (!(firstUnlock < secondUnlock && secondUnlock < toKill)) {
      warnings.push(`${sourcePath}: non-increasing Bestiary kill thresholds`);
    } else {
      bestiary = {
        raceId: Number(raceIdMatch[1]),
        class: klass,
        stars,
        occurrence,
        charmPoints,
        firstUnlock,
        secondUnlock,
        toKill,
        locations: locations ?? "",
      };
    }
  }

  let bosstiary = null;
  const bosstiaryBlock = extractBlock(luaSource, "monster.bosstiary");
  if (bosstiaryBlock) {
    const bossRaceId = readNumber(bosstiaryBlock, "bossRaceId");
    const rarityMatch = bosstiaryBlock.match(/bossRace\s*=\s*(RARITY_\w+)/);
    const category = rarityMatch ? BOSS_CATEGORIES[rarityMatch[1]] : undefined;
    if (bossRaceId === null || !category) {
      warnings.push(`${sourcePath}: incomplete bosstiary block`);
    } else {
      bosstiary = { raceId: bossRaceId, category };
    }
  }

  return { name, bestiary, bosstiary, warnings };
}

function extractBlock(source, prefix) {
  const start = source.indexOf(`${prefix} = {`);
  if (start === -1) {
    return null;
  }
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(open + 1, index);
      }
    }
  }
  return null;
}

function readNumber(block, key) {
  const match = block.match(new RegExp(`${key}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function readString(block, key) {
  const match = block.match(
    new RegExp(`${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`),
  );
  return match ? unescapeLua(match[1]) : null;
}

function unescapeLua(text) {
  return text.replace(/\\(.)/g, "$1");
}
