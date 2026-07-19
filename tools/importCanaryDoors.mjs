import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  parseDoorPairs,
  parseKeyItemIds,
  parseLevelDoorPositions,
} from "./parseCanaryDoorTables.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("usage: node tools/importCanaryDoors.mjs <canary-checkout>");
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);

async function readPinned(source) {
  const contents = await readFile(join(sourceRoot, source.path), "utf8");
  const sha256 = createHash("sha256").update(contents).digest("hex");
  if (sha256 !== source.sha256) {
    throw new Error(`${source.path} does not match the pinned manifest`);
  }
  return contents;
}

const doorsSource = manifest.sources.canaryDoors;
const levelDoorsSource = manifest.sources.canaryLevelDoors;
const doorsLua = await readPinned(doorsSource);
const levelDoorsLua = await readPinned(levelDoorsSource);

const doors = parseDoorPairs(doorsLua);
const keyItemIds = parseKeyItemIds(doorsLua);
const levelDoorPositions = parseLevelDoorPositions(levelDoorsLua);

await writeFile(
  join(repoRoot, "content/items/canary-doors.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.doors,
    source: {
      canaryCommit: doorsSource.commit,
      path: doorsSource.path,
      sha256: doorsSource.sha256,
    },
    keyItemIds,
    doors,
  })}\n`,
);
await writeFile(
  join(repoRoot, "server/data/door-levels.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.doors,
    source: {
      canaryCommit: levelDoorsSource.commit,
      path: levelDoorsSource.path,
      sha256: levelDoorsSource.sha256,
    },
    mapName: "otservbr",
    requirements: levelDoorPositions,
  })}\n`,
);
console.log(
  `imported ${doors.length} Canary door pairs and ${levelDoorPositions.length} level door positions`,
);
