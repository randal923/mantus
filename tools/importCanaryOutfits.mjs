// Generates server/src/outfit/outfitCatalogData.ts from Canary's pinned
// data/XML/outfits.xml and data/XML/mounts.xml, cross-checked against the
// client's sprite metadata (client/public/assets/objects.json).
//
// The catalog is the outer bound on what any character can ever wear, so an
// entry only survives if the sprite pack actually contains its look type —
// otherwise the client would throw on an outfit the server considers legal.
// The sprite metadata also decides how many addons an outfit really has
// (pattern-Y: py = 1 + addon passes), which the XML does not record.
//
// Usage: node tools/importCanaryOutfits.mjs [path-to-canary]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const canaryRoot = process.argv[2] ?? join(here, "../../canary");
const outfitsXmlPath = join(canaryRoot, "data/XML/outfits.xml");
const mountsXmlPath = join(canaryRoot, "data/XML/mounts.xml");
const objectsPath = join(here, "../client/public/assets/objects.json");
const outPath = join(here, "../server/src/outfit/outfitCatalogData.ts");

/** Canary's PlayerSex_t: 0 = female, 1 = male. */
const SEX_BY_TYPE = { 0: "female", 1: "male" };
const MAX_ADDONS = 2;

function attributes(tag) {
  const out = {};
  for (const match of tag.matchAll(/([A-Za-z]+)\s*=\s*"([^"]*)"/g)) {
    out[match[1]] = match[2];
  }
  return out;
}

function isYes(value) {
  return value === "yes" || value === "1" || value === "true";
}

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} is not a positive integer: ${value}`);
  }
  return parsed;
}

function readOutfitSprites() {
  const objects = JSON.parse(readFileSync(objectsPath, "utf8"));
  if (objects.formatVersion !== 2) {
    throw new Error("client objects.json has an unsupported format");
  }
  const sprites = new Map();
  for (const object of objects.objects) {
    if (object.category !== "outfit") continue;
    sprites.set(object.clientId, object);
  }
  if (sprites.size === 0) throw new Error("no outfit sprites in objects.json");
  return sprites;
}

function readOutfits(sprites) {
  const xml = readFileSync(outfitsXmlPath, "utf8");
  const outfits = [];
  const seen = new Set();
  const missing = [];
  for (const match of xml.matchAll(/<outfit\b([^/>]*)\/?>/g)) {
    const attrs = attributes(match[1]);
    const sex = SEX_BY_TYPE[Number(attrs.type)];
    if (!sex) throw new Error(`unknown outfit type: ${attrs.type}`);
    if (!isYes(attrs.enabled)) continue;
    const lookType = integer(attrs.looktype, "outfit looktype");
    if (seen.has(lookType)) {
      throw new Error(`duplicate outfit looktype ${lookType}`);
    }
    seen.add(lookType);
    const sprite = sprites.get(lookType);
    if (!sprite) {
      missing.push(lookType);
      continue;
    }
    outfits.push({
      lookType,
      name: attrs.name,
      sex,
      // Canary's unlocked="yes" is the set every character owns from creation.
      starter: isYes(attrs.unlocked),
      premium: isYes(attrs.premium),
      // py = base pass + one pattern per addon.
      addons: Math.min(MAX_ADDONS, Math.max(0, sprite.py - 1)),
    });
  }
  return { outfits, missing };
}

function readMounts(sprites) {
  const xml = readFileSync(mountsXmlPath, "utf8");
  const mounts = [];
  const seen = new Set();
  const missing = [];
  for (const match of xml.matchAll(/<mount\b([^/>]*)\/?>/g)) {
    const attrs = attributes(match[1]);
    const mountId = integer(attrs.id, "mount id");
    if (seen.has(mountId)) throw new Error(`duplicate mount id ${mountId}`);
    seen.add(mountId);
    const lookType = integer(attrs.clientid, "mount clientid");
    if (!sprites.has(lookType)) {
      missing.push(lookType);
      continue;
    }
    mounts.push({
      mountId,
      name: attrs.name,
      lookType,
      speed: Number(attrs.speed) || 0,
      premium: isYes(attrs.premium),
    });
  }
  return { mounts, missing };
}

function serializeOutfit(outfit) {
  return (
    `  { lookType: ${outfit.lookType}, name: ${JSON.stringify(outfit.name)}, ` +
    `sex: "${outfit.sex}", starter: ${outfit.starter}, ` +
    `premium: ${outfit.premium}, addons: ${outfit.addons} },`
  );
}

function serializeMount(mount) {
  return (
    `  { mountId: ${mount.mountId}, name: ${JSON.stringify(mount.name)}, ` +
    `lookType: ${mount.lookType}, speed: ${mount.speed}, ` +
    `premium: ${mount.premium} },`
  );
}

const sprites = readOutfitSprites();
const outfitResult = readOutfits(sprites);
const mountResult = readMounts(sprites);
if (outfitResult.outfits.length === 0 || mountResult.mounts.length === 0) {
  throw new Error("refusing to write an empty outfit catalog");
}
for (const sex of ["male", "female"]) {
  const starters = outfitResult.outfits.filter(
    (outfit) => outfit.sex === sex && outfit.starter,
  );
  if (starters.length === 0) {
    throw new Error(`no starter outfits parsed for ${sex}`);
  }
}

const output = `// Generated by tools/importCanaryOutfits.mjs from Canary's
// data/XML/outfits.xml and data/XML/mounts.xml — do not edit by hand.
//
// \`starter\` mirrors Canary's unlocked="yes": the outfits a character owns from
// creation. \`addons\` is how many addon passes the sprite pack actually has for
// that look type, so an addon bit is never granted for an outfit that cannot
// draw it. Behaviour lives in outfitCatalog.ts; this file is data only.
import type { MountDefinition, OutfitDefinition } from "./outfitCatalog";

export const OUTFIT_DEFINITIONS: ReadonlyArray<OutfitDefinition> = [
${outfitResult.outfits.map(serializeOutfit).join("\n")}
];

export const MOUNT_DEFINITIONS: ReadonlyArray<MountDefinition> = [
${mountResult.mounts.map(serializeMount).join("\n")}
];
`;

writeFileSync(outPath, output);
const starters = outfitResult.outfits.filter((outfit) => outfit.starter).length;
console.log(
  `wrote ${outPath}: ${outfitResult.outfits.length} outfits ` +
    `(${starters} granted at creation), ${mountResult.mounts.length} mounts`,
);
if (outfitResult.missing.length > 0) {
  console.warn(
    `skipped ${outfitResult.missing.length} outfits missing from the sprite ` +
      `pack: ${outfitResult.missing.join(", ")}`,
  );
}
if (mountResult.missing.length > 0) {
  console.warn(
    `skipped ${mountResult.missing.length} mounts missing from the sprite ` +
      `pack: ${mountResult.missing.join(", ")}`,
  );
}
