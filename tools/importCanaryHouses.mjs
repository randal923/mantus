// Imports Canary house metadata (otservbr-house.xml) from a pinned checkout.
// The XML is parsed with a strict attribute grammar; the result is
// cross-checked against the converted map content's per-tile house ids so the
// server ships only houses whose tiles exist in the shipped map.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("usage: node tools/importCanaryHouses.mjs <canary-checkout>");
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const source = manifest.sources.canaryHouses;
if (!source || manifest.converters.houses !== 1) {
  throw new Error("source manifest has no supported Canary house source");
}
const houseXml = await readFile(join(sourceRoot, source.path), "utf8");
const sha256 = createHash("sha256").update(houseXml).digest("hex");
if (sha256 !== source.sha256) {
  throw new Error(`${source.path} does not match the pinned manifest`);
}

const mapContent = JSON.parse(
  await readFile(join(repoRoot, "server/data/otservbr.content.json"), "utf8"),
);
if (mapContent.source.mapSha256 !== manifest.sources.map.sha256) {
  throw new Error("converted map content does not match the pinned OTBM");
}
if (!source.path.endsWith(`/${mapContent.otbm?.houseFile}`)) {
  throw new Error("pinned house XML does not match the OTBM house file name");
}

const tileCounts = new Map();
for (const entry of mapContent.tileMetadata ?? []) {
  if (!Number.isInteger(entry.houseId)) continue;
  tileCounts.set(entry.houseId, (tileCounts.get(entry.houseId) ?? 0) + 1);
}

const houses = [];
const seen = new Set();
for (const match of houseXml.matchAll(/<house\s+([^>]*?)\/>/g)) {
  const attributes = new Map();
  for (const pair of match[1].matchAll(/([a-z]+)="([^"]*)"/g)) {
    attributes.set(pair[1], pair[2]);
  }
  const integer = (name) => {
    const value = Number(attributes.get(name));
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`house entry has an invalid ${name}: ${match[0]}`);
    }
    return value;
  };
  const name = attributes.get("name");
  if (!name) throw new Error(`house entry is missing a name: ${match[0]}`);
  const houseId = integer("houseid");
  if (seen.has(houseId)) throw new Error(`duplicate house id ${houseId}`);
  seen.add(houseId);
  houses.push({
    houseId,
    name,
    entry: { x: integer("entryx"), y: integer("entryy"), z: integer("entryz") },
    rent: integer("rent"),
    townId: integer("townid"),
    size: integer("size"),
    guildhall: attributes.get("guildhall") === "true",
    beds: attributes.has("beds") ? integer("beds") : 0,
  });
}
if (houses.length === 0) throw new Error("no houses parsed from the XML");

const withoutTiles = houses.filter((house) => !tileCounts.has(house.houseId));
const orphanTileHouseIds = [...tileCounts.keys()].filter(
  (houseId) => !seen.has(houseId),
);
const shipped = houses
  .filter((house) => tileCounts.has(house.houseId))
  .sort((left, right) => left.houseId - right.houseId);

await writeFile(
  join(repoRoot, "server/data/houses.json"),
  `${JSON.stringify(
    {
      formatVersion: manifest.converters.houses,
      source: {
        canaryCommit: source.commit,
        path: source.path,
        sha256: source.sha256,
      },
      mapName: mapContent.name,
      report: {
        parsedHouses: houses.length,
        droppedWithoutTiles: withoutTiles.map((house) => house.houseId),
        tileHouseIdsWithoutXml: orphanTileHouseIds.sort((a, b) => a - b),
      },
      houses: shipped,
    },
    null,
    1,
  )}\n`,
);
console.log(
  `imported ${shipped.length} houses (${withoutTiles.length} without tiles dropped, ` +
    `${orphanTileHouseIds.length} tile house ids missing from the XML)`,
);
