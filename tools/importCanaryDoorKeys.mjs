import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseStorageConstants } from "./parseCanaryChestTables.mjs";
import { parseDoorKeyActions } from "./parseCanaryDoorKeys.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error(
    "usage: node tools/importCanaryDoorKeys.mjs <canary-checkout>",
  );
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

const doorKeysSource = manifest.sources.canaryDoorKeys;
const storagesSource = manifest.sources.canaryStorages;
const doorKeysLua = await readPinned(doorKeysSource);
const storagesLua = await readPinned(storagesSource);

const storageConstants = parseStorageConstants(storagesLua);
const doors = parseDoorKeyActions(doorKeysLua, storageConstants);
const positionCount = doors.reduce(
  (sum, door) => sum + door.positions.length,
  0,
);

await writeFile(
  join(repoRoot, "content/items/canary-door-keys.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.doorKeys,
    source: {
      canaryCommit: doorKeysSource.commit,
      path: doorKeysSource.path,
      sha256: doorKeysSource.sha256,
      storagesPath: storagesSource.path,
      storagesSha256: storagesSource.sha256,
    },
    counts: { doors: doors.length, positions: positionCount },
    doors,
  })}\n`,
);
await writeFile(
  join(repoRoot, "server/data/door-keys.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.doorKeys,
    mapName: "otservbr",
    doors,
  })}\n`,
);
console.log(
  `imported ${doors.length} Canary key door actions covering ${positionCount} door positions`,
);
