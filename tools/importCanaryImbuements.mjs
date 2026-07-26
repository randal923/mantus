import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Transcribes Canary's data/XML/imbuements.xml into typed content the server
// loads (content/imbuements.json). Values keep Canary's exact units: leech
// and critical amounts are hundredths of a percent (500 -> 5%), damage/
// reduction/capacity are whole percents, skill boosts are flat points.

const repoRoot = resolve(import.meta.dirname, "..");
const canaryPath = process.argv[2] ?? process.env.CANARY_PATH;
if (!canaryPath) {
  throw new Error("usage: node tools/importCanaryImbuements.mjs <canary-checkout>");
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

const xmlPath = join(canaryPath, "data/XML/imbuements.xml");
const xml = await readFile(xmlPath, "utf8");

// Stable slugs shared with the item catalog's per-item imbuement gates.
const CATEGORY_SLUGS = {
  0: "elemental-damage",
  1: "life-leech",
  2: "mana-leech",
  3: "critical-hit",
  4: "protection-death",
  5: "protection-earth",
  6: "protection-fire",
  7: "protection-ice",
  8: "protection-energy",
  9: "protection-holy",
  10: "speed",
  11: "skill-axe",
  12: "skill-sword",
  13: "skill-club",
  14: "skill-shielding",
  15: "skill-distance",
  16: "magic-level",
  17: "capacity",
  18: "skill-fist",
  19: "paralysis-deflection",
};

function attributesOf(tag) {
  const attributes = new Map();
  for (const match of tag.matchAll(/([A-Za-z][\w-]*)="([^"]*)"/g)) {
    attributes.set(match[1], match[2]);
  }
  return attributes;
}

function integer(value, label) {
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new Error(`${label} must be an integer, got ${value}`);
  }
  return Number(value);
}

const bases = [];
for (const match of xml.matchAll(/<base\s+([^>]*)\/>/g)) {
  const attributes = attributesOf(match[1]);
  bases.push({
    id: integer(attributes.get("id"), "base id"),
    name: attributes.get("name"),
    priceGold: integer(attributes.get("price"), "base price"),
    protectionPriceGold: integer(
      attributes.get("protectionPrice"),
      "base protectionPrice",
    ),
    successPercent: integer(attributes.get("percent"), "base percent"),
    removeCostGold: integer(attributes.get("removecost"), "base removecost"),
    durationSeconds: integer(attributes.get("duration"), "base duration"),
  });
}
if (bases.length !== 3) throw new Error(`expected 3 bases, found ${bases.length}`);

const categories = [];
for (const match of xml.matchAll(/<category\s+([^>]*)\/>/g)) {
  const attributes = attributesOf(match[1]);
  const id = integer(attributes.get("id"), "category id");
  const slug = CATEGORY_SLUGS[id];
  if (!slug) throw new Error(`category ${id} has no slug mapping`);
  categories.push({
    id,
    slug,
    name: attributes.get("name"),
    aggressive: attributes.get("agressive") === "1",
  });
}
if (categories.length !== 20) {
  throw new Error(`expected 20 categories, found ${categories.length}`);
}

const SKILL_NAMES = {
  axe: "axe",
  club: "club",
  sword: "sword",
  dist: "distance",
  distance: "distance",
  fist: "fist",
  shield: "shielding",
};

const imbuements = [];
const blocks = xml.split(/<imbuement\s+/).slice(1);
for (const block of blocks) {
  const headerEnd = block.indexOf(">");
  const header = attributesOf(block.slice(0, headerEnd));
  const body = block.slice(headerEnd + 1, block.indexOf("</imbuement>"));
  const id = imbuements.length + 1;
  const astralSources = [];
  let effect = null;
  let description = "";
  let scrollItemTypeId;
  for (const attributeMatch of body.matchAll(/<attribute\s+([^>]*)\/>/g)) {
    const attributes = attributesOf(attributeMatch[1]);
    const key = attributes.get("key");
    if (key === "description") {
      description = attributes.get("value") ?? "";
      continue;
    }
    if (key === "item") {
      astralSources.push({
        itemTypeId: integer(attributes.get("value"), `imbuement ${id} item`),
        count: integer(attributes.get("count") ?? "1", `imbuement ${id} count`),
      });
      continue;
    }
    if (key === "scroll") {
      scrollItemTypeId = integer(attributes.get("value"), `imbuement ${id} scroll`);
      continue;
    }
    if (key !== "effect") continue;
    const type = attributes.get("type");
    switch (type) {
      case "damage":
        effect = {
          kind: "damage",
          element: attributes.get("combat"),
          percent: Math.min(100, integer(attributes.get("value"), "damage value")),
        };
        break;
      case "reduction":
        effect = {
          kind: "reduction",
          element: attributes.get("combat"),
          percent: Math.min(100, integer(attributes.get("value"), "reduction value")),
        };
        break;
      case "speed":
        effect = { kind: "speed", amount: integer(attributes.get("value"), "speed") };
        break;
      case "capacity":
        effect = {
          kind: "capacity",
          percent: integer(attributes.get("value"), "capacity"),
        };
        break;
      case "paralysis":
        effect = {
          kind: "paralysis",
          removeChancePercent: Math.min(
            100,
            integer(attributes.get("chance") ?? attributes.get("value"), "paralysis"),
          ),
          pvpDeflect: attributes.get("pvpDeflect") === "1",
        };
        break;
      case "skill": {
        const skillValue = attributes.get("value");
        const bonus = integer(attributes.get("bonus"), "skill bonus");
        if (skillValue === "critical") {
          effect = {
            kind: "critical",
            damageHundredthsPercent: bonus,
            chanceHundredthsPercent: Math.min(
              10_000,
              integer(attributes.get("chance") ?? "100", "critical chance"),
            ),
          };
        } else if (skillValue === "lifeleech" || skillValue === "manaleech") {
          effect = {
            kind: "leech",
            resource: skillValue === "lifeleech" ? "life" : "mana",
            amountHundredthsPercent: bonus,
            chanceHundredthsPercent: Math.min(
              10_000,
              integer(attributes.get("chance") ?? "100", "leech chance"),
            ),
          };
        } else if (skillValue === "magicpoints") {
          effect = { kind: "magic-level", amount: bonus };
        } else {
          const skill = SKILL_NAMES[skillValue];
          if (!skill) throw new Error(`unknown skill value ${skillValue}`);
          effect = { kind: "skill", skill, amount: bonus };
        }
        break;
      }
      default:
        throw new Error(`unknown effect type ${type}`);
    }
  }
  if (!effect) throw new Error(`imbuement ${id} has no effect`);
  const categoryId = integer(header.get("category"), `imbuement ${id} category`);
  imbuements.push({
    id,
    name: header.get("name"),
    baseId: integer(header.get("base"), `imbuement ${id} base`),
    categoryId,
    categorySlug: CATEGORY_SLUGS[categoryId],
    ...(header.get("subgroup") ? { subgroup: header.get("subgroup").trim() } : {}),
    iconId: integer(header.get("iconid"), `imbuement ${id} iconid`),
    premium: header.get("premium") === "1",
    storageGate: integer(header.get("storage") ?? "0", `imbuement ${id} storage`),
    description,
    effect,
    astralSources,
    ...(scrollItemTypeId !== undefined ? { scrollItemTypeId } : {}),
  });
}
if (imbuements.length !== 72) {
  throw new Error(`expected 72 imbuement rows, found ${imbuements.length}`);
}

const document = {
  formatVersion: 1,
  source: {
    canaryCommit: pinnedCommit,
    path: "data/XML/imbuements.xml",
    sha256: createHash("sha256").update(xml).digest("hex"),
  },
  bases,
  categories,
  imbuements,
};

await writeFile(
  join(repoRoot, "content/imbuements.json"),
  `${JSON.stringify(document, null, 1)}\n`,
);
console.log(
  `imported ${imbuements.length} imbuements across ${categories.length} categories`,
);
