// Converts a Canary-format OTBM map (client item ids, no items.otb) into:
//   client/public/assets/map/<name>/  manifest + per-floor region JSONs (rendering)
//   server/data/<name>.map.bin        32x32-sector walkability bitsets
//   server/data/<name>.map.json       bounds, towns, spawn
// Usage: node tools/convertOtbm.mjs map/<name>.otbm [--floors=7,8 | --floors=all]
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const NODE_START = 0xfe;
const NODE_END = 0xff;
const ESCAPE = 0xfd;

const OTBM = {
  MAP_DATA: 2,
  TILE_AREA: 4,
  TILE: 5,
  ITEM: 6,
  TOWNS: 12,
  TOWN: 13,
  HOUSETILE: 14,
  ATTR_TILE_FLAGS: 3,
  ATTR_ITEM: 9,
};

const REGION_SIZE = 256;
const SECTOR_SIZE = 32;
const GAMEPLAY_FLOOR = 7;

const mapPath = process.argv[2];
if (!mapPath) {
  console.error(
    "usage: node tools/convertOtbm.mjs <map.otbm> [--floors=7,8|all]",
  );
  process.exit(1);
}
// above-ground floors by default: the client stacks z7..z0 for street views;
// underground (z8+) waits for stairs
const floorsArg =
  process.argv.find((a) => a.startsWith("--floors="))?.slice(9) ?? "0,1,2,3,4,5,6,7";
const clientFloors =
  floorsArg === "all"
    ? new Set(Array.from({ length: 16 }, (_, z) => z))
    : new Set(floorsArg.split(",").map(Number));

const mapName = basename(mapPath).replace(/\.otbm$/, "");
const repoRoot = join(import.meta.dirname, "..");
const clientDir = join(repoRoot, "client/public/assets/map", mapName);
const serverDir = join(repoRoot, "server/data");

const objects = JSON.parse(
  readFileSync(join(repoRoot, "client/public/assets/objects.json"), "utf8"),
);
/** clientId -> full object for items only. */
const itemsById = new Map();
for (const o of objects.objects) {
  if (o.category === "item") itemsById.set(o.clientId, o);
}

/**
 * Ids verified visually against the live client / ASSETS.md. If the asset
 * pack is re-ripped and these drift, every converted map is suspect — fail
 * before writing anything.
 */
const LANDMARK_IDS = [
  [106, { ground: true, width: 1, height: 1 }],
  [108, { ground: true }],
  [109, { ground: true }],
  [429, { ground: true }],
  [431, { ground: true }],
  [101, { ground: true, notWalkable: true }],
  [1281, { onBottom: true, width: 2, height: 2 }],
  [2109, { width: 2, height: 2 }],
];
for (const [id, expected] of LANDMARK_IDS) {
  const o = itemsById.get(id);
  if (!o) {
    console.error(`landmark check failed: item ${id} missing from objects.json`);
    process.exit(1);
  }
  for (const [key, value] of Object.entries(expected)) {
    const actual = key in o.flags ? o.flags[key] : o[key];
    if (actual !== value) {
      console.error(
        `landmark check failed: item ${id} ${key}=${actual}, expected ${value} — asset pack and verified ids have drifted`,
      );
      process.exit(1);
    }
  }
}

const buf = readFileSync(mapPath);
let pos = 4;

const u16 = (p, off) => p[off] | (p[off + 1] << 8);

/**
 * Depth-first walk without retaining the tree; enter() returns a per-node
 * state passed to children and to leave().
 */
function walk(parentState, enter, leave) {
  pos++; // NODE_START
  const type = buf[pos++];
  const props = [];
  while (pos < buf.length) {
    const byte = buf[pos];
    if (byte === ESCAPE) {
      props.push(buf[pos + 1]);
      pos += 2;
    } else if (byte === NODE_START || byte === NODE_END) {
      break;
    } else {
      props.push(byte);
      pos++;
    }
  }
  const state = enter(type, props, parentState);
  while (buf[pos] === NODE_START) walk(state, enter, leave);
  pos++; // NODE_END
  leave?.(type, state);
}

const stats = {
  tiles: 0,
  walkable: 0,
  itemsPlaced: 0,
  unknownIds: new Map(),
  minX: Infinity,
  maxX: -Infinity,
  minY: Infinity,
  maxY: -Infinity,
  floorTiles: new Map(),
};
/** "rx,ry,z" -> array of pre-serialized "[dx,dy,ground,...items]" strings. */
const regions = new Map();
/** "sx,sy,z" -> Uint8Array(SECTOR_SIZE*SECTOR_SIZE/8) walkability bitset. */
const sectors = new Map();
const towns = [];

const bumpUnknown = (id) =>
  stats.unknownIds.set(id, (stats.unknownIds.get(id) ?? 0) + 1);

function finishTile(tile) {
  const { x, y, z, ids } = tile;
  if (ids.length === 0) return;
  stats.tiles++;
  stats.minX = Math.min(stats.minX, x);
  stats.maxX = Math.max(stats.maxX, x);
  stats.minY = Math.min(stats.minY, y);
  stats.maxY = Math.max(stats.maxY, y);
  stats.floorTiles.set(z, (stats.floorTiles.get(z) ?? 0) + 1);

  let hasGround = false;
  let blocked = false;
  const drawIds = [];
  for (const id of ids) {
    const item = itemsById.get(id);
    if (!item) {
      bumpUnknown(id);
      continue;
    }
    if (item.flags.ground) hasGround = true;
    if (item.flags.notWalkable) blocked = true;
    drawIds.push(id);
  }
  stats.itemsPlaced += drawIds.length;

  if (z === GAMEPLAY_FLOOR && hasGround && !blocked) {
    stats.walkable++;
    const key = `${Math.floor(x / SECTOR_SIZE)},${Math.floor(y / SECTOR_SIZE)},${z}`;
    let bits = sectors.get(key);
    if (!bits) {
      bits = new Uint8Array((SECTOR_SIZE * SECTOR_SIZE) / 8);
      sectors.set(key, bits);
    }
    const bit = (y % SECTOR_SIZE) * SECTOR_SIZE + (x % SECTOR_SIZE);
    bits[bit >> 3] |= 1 << (bit & 7);
  }

  if (!clientFloors.has(z) || drawIds.length === 0) return;
  const regionKey = `${Math.floor(x / REGION_SIZE)},${Math.floor(y / REGION_SIZE)},${z}`;
  let entries = regions.get(regionKey);
  if (!entries) {
    entries = [];
    regions.set(regionKey, entries);
  }
  entries.push(`[${x % REGION_SIZE},${y % REGION_SIZE},${drawIds.join(",")}]`);
}

walk(
  null,
  (type, props, parent) => {
    if (type === OTBM.TILE_AREA) {
      return { area: { x: u16(props, 0), y: u16(props, 2), z: props[4] } };
    }
    if ((type === OTBM.TILE || type === OTBM.HOUSETILE) && parent?.area) {
      const tile = {
        x: parent.area.x + props[0],
        y: parent.area.y + props[1],
        z: parent.area.z,
        ids: [],
      };
      let off = 2 + (type === OTBM.HOUSETILE ? 4 : 0);
      while (off < props.length) {
        const attr = props[off++];
        if (attr === OTBM.ATTR_TILE_FLAGS) off += 4;
        else if (attr === OTBM.ATTR_ITEM) {
          tile.ids.push(u16(props, off));
          off += 2;
        } else break;
      }
      return { tile };
    }
    if (type === OTBM.ITEM && parent?.tile) {
      // direct tile children only; container contents nest deeper and are
      // not drawn on the map
      parent.tile.ids.push(u16(props, 0));
      return {};
    }
    if (type === OTBM.TOWN) {
      const nameLen = u16(props, 4);
      towns.push({
        name: String.fromCharCode(...props.slice(6, 6 + nameLen)),
        x: u16(props, 6 + nameLen),
        y: u16(props, 8 + nameLen),
        z: props[10 + nameLen],
      });
    }
    return parent;
  },
  (type, state) => {
    if ((type === OTBM.TILE || type === OTBM.HOUSETILE) && state?.tile) {
      finishTile(state.tile);
    }
  },
);

if (stats.unknownIds.size > 0) {
  const total = [...stats.unknownIds.values()].reduce((sum, count) => sum + count, 0);
  const examples = [...stats.unknownIds.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => `${id}(${count})`)
    .join(", ");
  console.error(
    `asset mismatch: ${stats.unknownIds.size} unknown item ids across ${total} placements`,
  );
  console.error(`most frequent missing ids: ${examples}`);
  console.error("conversion stopped before replacing existing outputs; use matching assets");
  process.exit(1);
}

const spawn = towns[0]
  ? { x: towns[0].x, y: towns[0].y, z: towns[0].z }
  : {
      x: Math.floor((stats.minX + stats.maxX) / 2),
      y: Math.floor((stats.minY + stats.maxY) / 2),
      z: 7,
    };

rmSync(clientDir, { recursive: true, force: true });
const regionsByFloor = new Map();
for (const [key, entries] of regions) {
  const [rx, ry, z] = key.split(",").map(Number);
  mkdirSync(join(clientDir, `z${z}`), { recursive: true });
  writeFileSync(
    join(clientDir, `z${z}`, `${rx}.${ry}.json`),
    `{"tiles":[${entries.join(",")}]}`,
  );
  if (!regionsByFloor.has(z)) regionsByFloor.set(z, []);
  regionsByFloor.get(z).push([rx, ry]);
}
const manifest = {
  name: mapName,
  regionSize: REGION_SIZE,
  bounds: {
    minX: stats.minX,
    maxX: stats.maxX,
    minY: stats.minY,
    maxY: stats.maxY,
  },
  spawn,
  towns,
  regions: Object.fromEntries(
    [...regionsByFloor.entries()].map(([z, list]) => [z, list]),
  ),
};
writeFileSync(join(clientDir, "manifest.json"), JSON.stringify(manifest));

mkdirSync(serverDir, { recursive: true });
const header = Buffer.alloc(12);
header.write("TMAP", 0, "ascii");
header.writeUInt8(1, 4);
header.writeUInt8(SECTOR_SIZE, 5);
header.writeUInt32LE(sectors.size, 8);
const sectorChunks = [header];
for (const [key, bits] of sectors) {
  const [sx, sy, z] = key.split(",").map(Number);
  const entry = Buffer.alloc(5 + bits.length);
  entry.writeUInt16LE(sx, 0);
  entry.writeUInt16LE(sy, 2);
  entry.writeUInt8(z, 4);
  entry.set(bits, 5);
  sectorChunks.push(entry);
}
writeFileSync(join(serverDir, `${mapName}.map.bin`), Buffer.concat(sectorChunks));
writeFileSync(
  join(serverDir, `${mapName}.map.json`),
  JSON.stringify({ name: mapName, bounds: manifest.bounds, spawn, towns }),
);

const floorSummary = [...stats.floorTiles.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([z, n]) => `z${z}:${n}`)
  .join(" ");
console.log(`map: ${mapName}`);
console.log(`tiles: ${stats.tiles} (walkable ${stats.walkable}), items placed: ${stats.itemsPlaced}`);
console.log(`bounds: x ${stats.minX}..${stats.maxX}, y ${stats.minY}..${stats.maxY}`);
console.log(`floors: ${floorSummary}`);
console.log(`towns: ${towns.map((t) => `${t.name}(${t.x},${t.y},${t.z})`).join(" ") || "none"}`);
console.log(`spawn: ${spawn.x},${spawn.y},${spawn.z}`);
console.log(`client regions written: ${regions.size} (floors ${[...clientFloors].join(",")})`);
console.log(`server sectors written: ${sectors.size}`);
