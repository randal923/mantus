// Converts a Canary-format OTBM map (client item ids, no items.otb) into:
//   client/public/assets/map/<name>/  manifest + per-floor region JSONs (rendering)
//   server/data/<name>.map.bin        32x32-sector walkability bitsets
//   server/data/<name>.map.json       bounds, towns, spawn
// Usage: node tools/convertOtbm.mjs map/<name>.otbm
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { decodeOtbmAttributes } from "./decodeOtbmAttributes.mjs";
import { getMapItemSemantics } from "./getMapItemSemantics.mjs";
import { resolveFloorChange } from "./resolveFloorChange.mjs";

const NODE_START = 0xfe;
const NODE_END = 0xff;
const ESCAPE = 0xfd;

const OTBM = {
  ROOT: 0,
  MAP_DATA: 2,
  TILE_AREA: 4,
  TILE: 5,
  ITEM: 6,
  TOWNS: 12,
  TOWN: 13,
  HOUSETILE: 14,
  WAYPOINTS: 15,
  WAYPOINT: 16,
  TILE_ZONE: 19,
  ATTR_TILE_FLAGS: 3,
  ATTR_ITEM: 9,
};

const REGION_SIZE = 256;
const SECTOR_SIZE = 32;
/** OTClient thing-stack insertion order; the lowest present is getThing(0). */
const STACK_PRIORITIES = {
  ground: 0,
  border: 1,
  bottom: 2,
  top: 3,
  common: 5,
};
const FLOORS = new Set(Array.from({ length: 16 }, (_, z) => z));
const ZONE_FLAGS = {
  protection: 1 << 0,
  noPvp: 1 << 2,
  noLogout: 1 << 3,
  pvp: 1 << 4,
};

const mapPath = process.argv[2];
if (!mapPath) {
  console.error(
    "usage: node tools/convertOtbm.mjs <map.otbm>",
  );
  process.exit(1);
}
const mapName = basename(mapPath).replace(/\.otbm$/, "");
const repoRoot = join(import.meta.dirname, "..");
const clientDir = join(repoRoot, "client/public/assets/map", mapName);
const serverDir = join(repoRoot, "server/data");

const sourceManifest = JSON.parse(
  readFileSync(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const itemSemantics = JSON.parse(
  readFileSync(join(repoRoot, "content/canary-item-semantics.json"), "utf8"),
);
const transitionOverrides = JSON.parse(
  readFileSync(join(repoRoot, "content/map-transition-overrides.json"), "utf8"),
);
const objects = JSON.parse(
  readFileSync(join(repoRoot, "client/public/assets/objects.json"), "utf8"),
);
if (sourceManifest.converters.map !== 3) {
  throw new Error(`unsupported map converter version ${sourceManifest.converters.map}`);
}
if (sourceManifest.sources.map.name !== mapName) {
  throw new Error(`source manifest is for ${sourceManifest.sources.map.name}, not ${mapName}`);
}
if (
  objects.source?.datSha256 !== sourceManifest.sources.dat.sha256 ||
  objects.source?.sprSha256 !== sourceManifest.sources.spr.sha256
) {
  throw new Error("objects.json does not match the DAT/SPR source manifest");
}
if (
  itemSemantics.formatVersion !== sourceManifest.converters.canaryItems ||
  itemSemantics.source?.canaryCommit !==
    sourceManifest.sources.canaryItems.commit ||
  itemSemantics.source?.sha256 !== sourceManifest.sources.canaryItems.sha256
) {
  throw new Error("item semantics do not match the Canary source manifest");
}
/** clientId -> full object for items only. */
const itemsById = new Map();
for (const o of objects.objects) {
  if (o.category === "item") itemsById.set(o.clientId, o);
}
const groundSpeeds = [
  ...new Set(
    [...itemsById.values()]
      .filter((item) => item.flags.ground)
      .map((item) => item.flags.groundSpeed),
  ),
].sort((a, b) => a - b);
if (groundSpeeds.length > 32) {
  throw new Error(`map format supports 32 ground speeds, found ${groundSpeeds.length}`);
}
const groundSpeedIndexes = new Map(
  groundSpeeds.map((groundSpeed, index) => [groundSpeed, index]),
);

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
const mapHash = createHash("sha256").update(buf).digest("hex");
if (mapHash !== sourceManifest.sources.map.sha256) {
  throw new Error(`map source hash ${mapHash} does not match source manifest`);
}
if (transitionOverrides.mapSha256 !== mapHash) {
  throw new Error("map transition overrides do not match the map source hash");
}
let pos = 4;

const u16 = (p, off) => p[off] | (p[off + 1] << 8);
const u32 = (p, off) =>
  (p[off] | (p[off + 1] << 8) | (p[off + 2] << 16) | (p[off + 3] << 24)) >>> 0;

function readString(props, offset, label) {
  if (offset + 2 > props.length) throw new Error(`${label} string is truncated`);
  const length = u16(props, offset);
  const start = offset + 2;
  const end = start + length;
  if (end > props.length) throw new Error(`${label} string is truncated`);
  return {
    value: Buffer.from(props.slice(start, end)).toString("utf8"),
    offset: end,
  };
}

function parseMapDataProperties(props) {
  const metadata = { descriptions: [] };
  const keys = new Map([
    [11, "monsterSpawnFile"],
    [13, "houseFile"],
    [23, "npcSpawnFile"],
    [24, "zoneFile"],
  ]);
  let offset = 0;
  while (offset < props.length) {
    const attribute = props[offset++];
    const decoded = readString(props, offset, `map attribute ${attribute}`);
    offset = decoded.offset;
    if (attribute === 1) {
      metadata.descriptions.push(decoded.value);
      continue;
    }
    const key = keys.get(attribute);
    if (!key) throw new Error(`unknown required OTBM map attribute ${attribute}`);
    metadata[key] = decoded.value;
  }
  return metadata;
}

function parseRootProperties(props) {
  if (props.length !== 16) {
    throw new Error(`OTBM root has ${props.length} bytes, expected 16`);
  }
  return {
    version: u32(props, 0),
    width: u16(props, 4),
    height: u16(props, 6),
    itemsMajorVersion: u32(props, 8),
    itemsMinorVersion: u32(props, 12),
  };
}

function parseTileProperties(props, type, area) {
  const baseOffset = 2 + (type === OTBM.HOUSETILE ? 4 : 0);
  if (props.length < baseOffset) throw new Error("OTBM tile properties are truncated");
  const tile = {
    x: area.x + props[0],
    y: area.y + props[1],
    z: area.z,
    houseId: type === OTBM.HOUSETILE ? u32(props, 2) : null,
    flags: 0,
    zoneIds: [],
    items: [],
  };
  let offset = baseOffset;
  while (offset < props.length) {
    const attribute = props[offset++];
    if (attribute === OTBM.ATTR_TILE_FLAGS) {
      if (offset + 4 > props.length) throw new Error("OTBM tile flags are truncated");
      tile.flags = u32(props, offset);
      offset += 4;
      continue;
    }
    if (attribute === OTBM.ATTR_ITEM) {
      if (offset + 2 > props.length) throw new Error("OTBM tile item is truncated");
      tile.items.push({ id: u16(props, offset), attributes: {}, contents: [] });
      offset += 2;
      continue;
    }
    throw new Error(
      `unknown required OTBM tile attribute ${attribute} at ${tile.x},${tile.y},${tile.z}`,
    );
  }
  return tile;
}

function setBit(bytes, bit, value) {
  if (value) bytes[bit >> 3] |= 1 << (bit & 7);
}

function setPackedFiveBit(bytes, index, value) {
  const bitOffset = index * 5;
  const byteOffset = bitOffset >> 3;
  const shift = bitOffset & 7;
  const combined = (bytes[byteOffset] ?? 0) | ((bytes[byteOffset + 1] ?? 0) << 8);
  const replaced = (combined & ~(0x1f << shift)) | (value << shift);
  bytes[byteOffset] = replaced & 0xff;
  if (shift > 3) bytes[byteOffset + 1] = (replaced >> 8) & 0xff;
}

function createSector() {
  const bitsetBytes = (SECTOR_SIZE * SECTOR_SIZE) / 8;
  return {
    present: new Uint8Array(bitsetBytes),
    walkable: new Uint8Array(bitsetBytes),
    blocksProjectile: new Uint8Array(bitsetBytes),
    blocksPath: new Uint8Array(bitsetBytes),
    limitsFloorView: new Uint8Array(bitsetBytes),
    limitsFloorViewFree: new Uint8Array(bitsetBytes),
    protectionZone: new Uint8Array(bitsetBytes),
    noPvpZone: new Uint8Array(bitsetBytes),
    noLogoutZone: new Uint8Array(bitsetBytes),
    pvpZone: new Uint8Array(bitsetBytes),
    groundSpeed: new Uint8Array((SECTOR_SIZE * SECTOR_SIZE * 5) / 8),
  };
}

function publishOutputs(outputs, stagingRoot) {
  const backups = [];
  const published = [];
  try {
    for (const { staged, target } of outputs) {
      const backup = `${target}.backup-${process.pid}`;
      rmSync(backup, { recursive: true, force: true });
      if (existsSync(target)) {
        renameSync(target, backup);
        backups.push({ backup, target });
      }
      renameSync(staged, target);
      published.push(target);
    }
  } catch (cause) {
    for (const target of published.reverse()) {
      rmSync(target, { recursive: true, force: true });
    }
    for (const { backup, target } of backups.reverse()) {
      if (existsSync(backup)) renameSync(backup, target);
    }
    throw cause;
  }
  for (const { backup } of backups) {
    rmSync(backup, { recursive: true, force: true });
  }
  rmSync(stagingRoot, { recursive: true, force: true });
}

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
  mutableItems: 0,
  interactiveItems: 0,
  redundantTeleports: 0,
  unknownIds: new Map(),
  minX: Infinity,
  maxX: -Infinity,
  minY: Infinity,
  maxY: -Infinity,
  floorTiles: new Map(),
};
/** "rx,ry,z" -> array of pre-serialized "[dx,dy,ground,...items]" strings. */
const regions = new Map();
/** "sx,sy,z" -> tile-presence and walkability bitsets. */
const sectors = new Map();
const towns = [];
const waypoints = [];
const worldItems = [];
const worldActions = [];
const mapTileMetadata = [];
const floorChanges = new Map();
const transitionConflicts = [];
const teleports = new Map();
let rootMetadata = null;
let mapMetadata = null;

const bumpUnknown = (id) =>
  stats.unknownIds.set(id, (stats.unknownIds.get(id) ?? 0) + 1);

function validatePlacedItems(items) {
  for (const item of items) {
    stats.itemsPlaced++;
    if (!itemsById.has(item.id)) bumpUnknown(item.id);
    validatePlacedItems(item.contents);
  }
}

function finishTile(tile) {
  const { x, y, z, items } = tile;
  if (!FLOORS.has(z)) {
    throw new Error(`tile ${x},${y} uses out-of-range floor ${z}`);
  }
  if (x < 0 || x > 65_535 || y < 0 || y > 65_535) {
    throw new Error(`tile position ${x},${y},${z} is out of range`);
  }
  if (items.length === 0 && tile.flags === 0 && tile.zoneIds.length === 0) return;
  stats.tiles++;
  stats.minX = Math.min(stats.minX, x);
  stats.maxX = Math.max(stats.maxX, x);
  stats.minY = Math.min(stats.minY, y);
  stats.maxY = Math.max(stats.maxY, y);
  stats.floorTiles.set(z, (stats.floorTiles.get(z) ?? 0) + 1);
  if (tile.houseId !== null || tile.zoneIds.length > 0) {
    mapTileMetadata.push({
      position: { x, y, z },
      houseId: tile.houseId,
      zoneIds: tile.zoneIds,
    });
  }

  let hasGround = false;
  let groundSpeed = 0;
  let blocksSolid = false;
  let blocksProjectile = false;
  let blocksPath = false;
  let firstStackThing = null;
  let firstStackPriority = Infinity;
  const drawIds = [];
  let floorChange = null;
  let floorChangeItemId = null;
  let floorChangeKind = "floor-change";
  let floorChangeRestricted = false;
  validatePlacedItems(items);
  for (const [stackIndex, placedItem] of items.entries()) {
    const appearance = itemsById.get(placedItem.id);
    if (!appearance) continue;
    const staticItem = itemSemantics.items[placedItem.id] ?? {};
    const semantics = getMapItemSemantics(
      appearance,
      staticItem,
      placedItem.attributes,
    );
    hasGround ||= semantics.ground;
    if (semantics.ground) groundSpeed = semantics.groundSpeed;
    blocksSolid ||= semantics.blocksSolid;
    blocksProjectile ||= semantics.blocksProjectile;
    blocksPath ||= semantics.blocksPath;
    const stackPriority = STACK_PRIORITIES[semantics.stackOrder];
    if (stackPriority < firstStackPriority) {
      firstStackThing = appearance;
      firstStackPriority = stackPriority;
    }

    if (semantics.mutable || semantics.interactive) {
      const classification = semantics.mutable ? "mutable" : "interactive";
      worldItems.push({
        instanceId: `${mapName}:${x}:${y}:${z}:${stackIndex}`,
        position: { x, y, z },
        stackIndex,
        itemId: placedItem.id,
        classification,
        attributes: placedItem.attributes,
        contents: placedItem.contents,
      });
      if (semantics.mutable) stats.mutableItems++;
      else stats.interactiveItems++;
    }
    if (!semantics.mutable) drawIds.push(placedItem.id);

    const itemFloorChange = staticItem.floorChange;
    if (itemFloorChange) {
      if (floorChange && floorChange !== itemFloorChange) {
        transitionConflicts.push({
          position: { x, y, z },
          first: { itemId: floorChangeItemId, floorChange },
          second: { itemId: placedItem.id, floorChange: itemFloorChange },
        });
      }
      floorChange ??= itemFloorChange;
      floorChangeItemId ??= placedItem.id;
      floorChangeRestricted ||=
        placedItem.attributes.actionId !== undefined ||
        placedItem.attributes.uniqueId !== undefined;
      if (staticItem.name?.toLowerCase().includes("hole")) {
        floorChangeKind = "hole";
      }
    }
    const teleportDestination = placedItem.attributes.teleportDestination;
    if (teleportDestination) {
      const key = `${x},${y},${z}`;
      const existing = teleports.get(key);
      if (existing) {
        if (
          existing.destination.x !== teleportDestination.x ||
          existing.destination.y !== teleportDestination.y ||
          existing.destination.z !== teleportDestination.z
        ) {
          throw new Error(`conflicting teleport destinations at ${key}`);
        }
        existing.restricted ||=
          placedItem.attributes.actionId !== undefined ||
          placedItem.attributes.uniqueId !== undefined;
        stats.redundantTeleports++;
      } else {
        teleports.set(key, {
          kind: "teleport",
          activation: "step",
          source: { x, y, z },
          destination: teleportDestination,
          itemId: placedItem.id,
          restricted:
            placedItem.attributes.actionId !== undefined ||
            placedItem.attributes.uniqueId !== undefined,
        });
      }
    }
    if (staticItem.type === "ladder") {
      const restricted =
        placedItem.attributes.actionId !== undefined ||
        placedItem.attributes.uniqueId !== undefined;
      worldActions.push({
        kind: "ladder",
        activation: "use",
        source: { x, y, z },
        destination: z > 0 ? { x, y: y + 1, z: z - 1 } : null,
        itemId: placedItem.id,
        enabled: z > 0 && !restricted,
        ...(restricted ? { reason: "requires-content-action" } : {}),
      });
    }
    // Use-activated dropdowns (sewer grates, closed trapdoors, large holes,
    // grilles): "dropdowns" without an automatic step floor change move the
    // player one floor straight down on use, like Canary's sewer grate.
    if (staticItem.primaryType === "dropdowns" && !staticItem.floorChange) {
      const restricted =
        placedItem.attributes.actionId !== undefined ||
        placedItem.attributes.uniqueId !== undefined;
      worldActions.push({
        kind: "dropdown",
        activation: "use",
        source: { x, y, z },
        destination: z < 15 ? { x, y, z: z + 1 } : null,
        itemId: placedItem.id,
        enabled: z < 15 && !restricted,
        ...(restricted ? { reason: "requires-content-action" } : {}),
      });
    }
    if (
      staticItem.name?.toLowerCase().includes("hole") &&
      !itemFloorChange
    ) {
      worldActions.push({
        kind: "rope-or-shovel",
        activation: "use-with",
        source: { x, y, z },
        destination: z > 0 ? { x, y: y + 1, z: z - 1 } : null,
        itemId: placedItem.id,
        enabled: false,
        reason: "requires-authoritative-tool-and-content-action",
      });
    }
  }
  // OTClient's Tile::limitsFloorsView examines only the first thing in stack
  // order, so e.g. a border-only tile carrying a cliff face does not hide the
  // floors above it.
  const firstFlags = firstStackThing?.flags;
  const limitsFloorViewFree = Boolean(
    firstFlags &&
      !firstFlags.dontHide &&
      (firstFlags.ground || firstFlags.onBottom),
  );
  const limitsFloorView = Boolean(
    firstFlags &&
      !firstFlags.dontHide &&
      (firstFlags.ground ||
        (firstFlags.onBottom && firstFlags.blockProjectile)),
  );
  const key = `${Math.floor(x / SECTOR_SIZE)},${Math.floor(y / SECTOR_SIZE)},${z}`;
  let sector = sectors.get(key);
  if (!sector) {
    sector = createSector();
    sectors.set(key, sector);
  }
  const bit = (y % SECTOR_SIZE) * SECTOR_SIZE + (x % SECTOR_SIZE);
  setBit(sector.present, bit, true);
  const walkable = hasGround && !blocksSolid;
  setBit(sector.walkable, bit, walkable);
  setBit(sector.blocksProjectile, bit, blocksProjectile);
  setBit(sector.blocksPath, bit, blocksPath);
  setBit(sector.limitsFloorView, bit, limitsFloorView);
  setBit(sector.limitsFloorViewFree, bit, limitsFloorViewFree);
  setBit(sector.protectionZone, bit, (tile.flags & ZONE_FLAGS.protection) !== 0);
  setBit(sector.noPvpZone, bit, (tile.flags & ZONE_FLAGS.noPvp) !== 0);
  setBit(sector.noLogoutZone, bit, (tile.flags & ZONE_FLAGS.noLogout) !== 0);
  setBit(sector.pvpZone, bit, (tile.flags & ZONE_FLAGS.pvp) !== 0);
  const groundSpeedIndex = groundSpeedIndexes.get(groundSpeed);
  if (groundSpeedIndex === undefined) {
    throw new Error(`tile ${x},${y},${z} has unknown ground speed ${groundSpeed}`);
  }
  setPackedFiveBit(sector.groundSpeed, bit, groundSpeedIndex);
  if (walkable) stats.walkable++;

  if (floorChange) {
    floorChanges.set(`${x},${y},${z}`, {
      kind: floorChangeKind,
      source: { x, y, z },
      floorChange,
      itemId: floorChangeItemId,
      walkable,
      restricted: floorChangeRestricted,
    });
  }

  if (drawIds.length === 0) return;
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
    if (type === OTBM.ROOT) {
      if (rootMetadata) throw new Error("OTBM contains more than one root");
      rootMetadata = parseRootProperties(props);
      return { root: true };
    }
    if (type === OTBM.MAP_DATA) {
      if (mapMetadata) throw new Error("OTBM contains more than one map-data node");
      mapMetadata = parseMapDataProperties(props);
      return { mapData: true };
    }
    if (type === OTBM.TILE_AREA) {
      if (props.length !== 5) throw new Error("OTBM tile area is malformed");
      const area = { x: u16(props, 0), y: u16(props, 2), z: props[4] };
      if (!FLOORS.has(area.z)) {
        throw new Error(`OTBM tile area uses out-of-range floor ${area.z}`);
      }
      return { area };
    }
    if ((type === OTBM.TILE || type === OTBM.HOUSETILE) && parent?.area) {
      return { tile: parseTileProperties(props, type, parent.area) };
    }
    if (type === OTBM.ITEM && (parent?.tile || parent?.item)) {
      if (props.length < 2) throw new Error("OTBM item node is truncated");
      const item = {
        id: u16(props, 0),
        attributes: decodeOtbmAttributes(Buffer.from(props.slice(2))),
        contents: [],
      };
      if (parent.item) parent.item.contents.push(item);
      else parent.tile.items.push(item);
      return { item, tile: parent.tile };
    }
    if (type === OTBM.TILE_ZONE && parent?.tile) {
      if (props.length < 2) throw new Error("OTBM tile-zone node is truncated");
      const count = u16(props, 0);
      if (props.length !== 2 + count * 2) {
        throw new Error("OTBM tile-zone count does not match its data");
      }
      for (let offset = 2; offset < props.length; offset += 2) {
        const zoneId = u16(props, offset);
        if (zoneId === 0) throw new Error("OTBM tile-zone id must be positive");
        parent.tile.zoneIds.push(zoneId);
      }
      return { tileZone: true };
    }
    if (type === OTBM.TOWN) {
      if (props.length < 11) throw new Error("OTBM town node is truncated");
      const name = readString(props, 4, "town name");
      if (name.offset + 5 !== props.length) {
        throw new Error("OTBM town node has trailing or truncated data");
      }
      towns.push({
        id: u32(props, 0),
        name: name.value,
        x: u16(props, name.offset),
        y: u16(props, name.offset + 2),
        z: props[name.offset + 4],
      });
      return { town: true };
    }
    if (type === OTBM.WAYPOINT) {
      const name = readString(props, 0, "waypoint name");
      if (name.offset + 5 !== props.length) {
        throw new Error("OTBM waypoint node has trailing or truncated data");
      }
      waypoints.push({
        name: name.value,
        x: u16(props, name.offset),
        y: u16(props, name.offset + 2),
        z: props[name.offset + 4],
      });
      return { waypoint: true };
    }
    if (type === OTBM.TOWNS || type === OTBM.WAYPOINTS) {
      if (props.length !== 0) throw new Error(`OTBM container node ${type} has data`);
      return { container: type };
    }
    throw new Error(`unknown required OTBM node type ${type}`);
  },
  (type, state) => {
    if ((type === OTBM.TILE || type === OTBM.HOUSETILE) && state?.tile) {
      finishTile(state.tile);
    }
  },
);

if (!rootMetadata || !mapMetadata) {
  throw new Error("OTBM root or map-data metadata is missing");
}
if (
  stats.maxX >= rootMetadata.width ||
  stats.maxY >= rootMetadata.height
) {
  throw new Error("OTBM tile coordinates exceed the declared map dimensions");
}
for (const key of [
  "monsterSpawnFile",
  "npcSpawnFile",
  "houseFile",
  "zoneFile",
]) {
  const filename = mapMetadata[key];
  if (filename && !/^[A-Za-z0-9._-]+$/.test(filename)) {
    throw new Error(`unsafe OTBM external filename ${filename}`);
  }
}
for (const entry of [...towns, ...waypoints]) {
  if (!FLOORS.has(entry.z)) {
    throw new Error(`${entry.name} uses out-of-range floor ${entry.z}`);
  }
}

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
const unusedOverrides = new Map(
  transitionOverrides.overrides.map((override) => [
    `${override.position.x},${override.position.y},${override.position.z}`,
    override,
  ]),
);
for (const conflict of transitionConflicts) {
  const key = `${conflict.position.x},${conflict.position.y},${conflict.position.z}`;
  const override = unusedOverrides.get(key);
  if (!override) {
    throw new Error(
      `conflicting floor transitions at ${key}: ${conflict.first.itemId}/${conflict.first.floorChange} vs ${conflict.second.itemId}/${conflict.second.floorChange}`,
    );
  }
  const selected = [conflict.first, conflict.second].find(
    (candidate) => candidate.floorChange === override.floorChange,
  );
  if (!selected) {
    throw new Error(`floor transition override at ${key} selects absent metadata`);
  }
  floorChanges.set(key, {
    kind: itemSemantics.items[selected.itemId]?.name
      ?.toLowerCase()
      .includes("hole")
      ? "hole"
      : "floor-change",
    source: conflict.position,
    floorChange: selected.floorChange,
    itemId: selected.itemId,
    walkable: floorChanges.get(key)?.walkable ?? false,
    restricted: floorChanges.get(key)?.restricted ?? false,
  });
  unusedOverrides.delete(key);
}
if (unusedOverrides.size > 0) {
  throw new Error(
    `unused floor transition overrides: ${[...unusedOverrides.keys()].join(", ")}`,
  );
}

const transitions = [];
const invalidTransitions = [];
const hasSectorBit = ({ x, y, z }, property) => {
  if (x < 0 || x > 65_535 || y < 0 || y > 65_535 || !FLOORS.has(z)) {
    return false;
  }
  const sector = sectors.get(
    `${Math.floor(x / SECTOR_SIZE)},${Math.floor(y / SECTOR_SIZE)},${z}`,
  );
  if (!sector) return false;
  const bit = (y % SECTOR_SIZE) * SECTOR_SIZE + (x % SECTOR_SIZE);
  return (sector[property][bit >> 3] & (1 << (bit & 7))) !== 0;
};
const hasTile = (position) => hasSectorBit(position, "present");
const isWalkable = (position) => hasSectorBit(position, "walkable");
const transitionSources = new Set();
for (const transition of floorChanges.values()) {
  if (transition.restricted) {
    invalidTransitions.push({
      ...transition,
      destination: null,
      reason: "requires-content-action",
    });
    continue;
  }
  if (!transition.walkable) {
    invalidTransitions.push({
      ...transition,
      destination: null,
      reason: "source-not-walkable",
    });
    continue;
  }
  const destination = resolveFloorChange(
    transition.source,
    transition.floorChange,
    (position) =>
      floorChanges.get(`${position.x},${position.y},${position.z}`)?.floorChange,
  );
  if (!destination) {
    invalidTransitions.push({
      ...transition,
      destination: null,
      reason: "out-of-range-destination",
    });
    continue;
  }
  if (!hasTile(destination)) {
    invalidTransitions.push({
      ...transition,
      destination,
      reason: "missing-destination",
    });
    continue;
  }
  if (!isWalkable(destination)) {
    invalidTransitions.push({
      ...transition,
      destination,
      reason: "blocked-destination",
    });
    continue;
  }
  const sourceKey = `${transition.source.x},${transition.source.y},${transition.source.z}`;
  if (transitionSources.has(sourceKey)) {
    throw new Error(`duplicate enabled transition at ${sourceKey}`);
  }
  transitionSources.add(sourceKey);
  transitions.push({
    kind: transition.kind,
    activation: "step",
    source: transition.source,
    destination,
    itemId: transition.itemId,
  });
}
for (const teleport of teleports.values()) {
  const sourceKey = `${teleport.source.x},${teleport.source.y},${teleport.source.z}`;
  let reason = null;
  if (teleport.restricted) reason = "requires-content-action";
  else if (!isWalkable(teleport.source)) reason = "source-not-walkable";
  else if (!hasTile(teleport.destination)) reason = "missing-destination";
  else if (!isWalkable(teleport.destination)) reason = "blocked-destination";
  else if (transitionSources.has(sourceKey)) reason = "duplicate-source";
  if (reason) {
    invalidTransitions.push({ ...teleport, reason });
    continue;
  }
  transitionSources.add(sourceKey);
  const { restricted: _restricted, ...enabledTeleport } = teleport;
  transitions.push(enabledTeleport);
}
// Canary's Position:moveUpstairs tries the tile south of the ladder first,
// then the remaining neighbours in this order. Dropdowns drop straight
// down with no scan, so they only get the primary destination.
const LADDER_FALLBACK_OFFSETS = [
  [0, -1],
  [1, 0],
  [-1, 0],
  [-1, 1],
  [1, 1],
  [-1, -1],
  [1, -1],
];
for (const action of worldActions) {
  if (
    (action.kind !== "ladder" && action.kind !== "dropdown") ||
    !action.enabled ||
    !action.destination
  ) {
    continue;
  }
  if (isWalkable(action.destination)) continue;
  if (action.kind === "ladder") {
    const fallback = LADDER_FALLBACK_OFFSETS.map(([dx, dy]) => ({
      x: action.source.x + dx,
      y: action.source.y + dy,
      z: action.destination.z,
    })).find(isWalkable);
    if (fallback) {
      action.destination = fallback;
      continue;
    }
  }
  action.enabled = false;
  action.reason = hasTile(action.destination)
    ? "blocked-destination"
    : "missing-destination";
}
const byPosition = (a, b) => {
  const first = a.source ?? a.position;
  const second = b.source ?? b.position;
  return (
    first.z - second.z ||
    first.y - second.y ||
    first.x - second.x
  );
};
transitions.sort((a, b) => byPosition(a, b) || a.itemId - b.itemId);
invalidTransitions.sort((a, b) => byPosition(a, b) || a.itemId - b.itemId);
worldActions.sort((a, b) => byPosition(a, b) || a.itemId - b.itemId);
worldItems.sort((a, b) => byPosition(a, b) || a.stackIndex - b.stackIndex);
mapTileMetadata.sort(byPosition);
let itemsOnTile = 0;
let previousItemPosition = "";
for (const item of worldItems) {
  const key = `${item.position.x},${item.position.y},${item.position.z}`;
  itemsOnTile = key === previousItemPosition ? itemsOnTile + 1 : 1;
  previousItemPosition = key;
  if (itemsOnTile > 16) {
    throw new Error(`tile ${key} has more than 16 server-owned map items`);
  }
}
const spawn = towns[0]
  ? { x: towns[0].x, y: towns[0].y, z: towns[0].z }
  : {
      x: Math.floor((stats.minX + stats.maxX) / 2),
      y: Math.floor((stats.minY + stats.maxY) / 2),
      z: 7,
    };

const stagingRoot = join(repoRoot, `.map-staging-${mapName}-${process.pid}`);
const clientStage = join(stagingRoot, "client");
const serverBinStage = join(stagingRoot, `${mapName}.map.bin`);
const serverItemsStage = join(stagingRoot, `${mapName}.items.bin`);
const serverMetaStage = join(stagingRoot, `${mapName}.map.json`);
const serverContentStage = join(stagingRoot, `${mapName}.content.json`);
rmSync(stagingRoot, { recursive: true, force: true });
mkdirSync(clientStage, { recursive: true });
const regionsByFloor = new Map();
const regionContentHash = createHash("sha256");
for (const [key, entries] of [...regions.entries()].sort(([a], [b]) =>
  a.localeCompare(b, "en", { numeric: true }),
)) {
  const [rx, ry, z] = key.split(",").map(Number);
  mkdirSync(join(clientStage, `z${z}`), { recursive: true });
  const payload = `{"tiles":[${entries.join(",")}]}`;
  writeFileSync(join(clientStage, `z${z}`, `${rx}.${ry}.json`), payload);
  regionContentHash.update(key).update(payload);
  if (!regionsByFloor.has(z)) regionsByFloor.set(z, []);
  regionsByFloor.get(z).push([rx, ry]);
}
const manifest = {
  formatVersion: sourceManifest.converters.map,
  source: { mapSha256: mapHash },
  /** Content hash of the generated regions; busts long-lived browser caches. */
  version: regionContentHash.digest("hex").slice(0, 16),
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
    [...regionsByFloor.entries()]
      .sort(([a], [b]) => a - b)
      .map(([z, list]) => [
        z,
        list.sort(([ax, ay], [bx, by]) => ax - bx || ay - by),
      ]),
  ),
};
writeFileSync(join(clientStage, "manifest.json"), JSON.stringify(manifest));

mkdirSync(serverDir, { recursive: true });
const header = Buffer.alloc(12);
header.write("TMAP", 0, "ascii");
header.writeUInt8(sourceManifest.converters.map, 4);
header.writeUInt8(SECTOR_SIZE, 5);
header.writeUInt32LE(sectors.size, 8);
const sectorChunks = [header];
const binaryProperties = [
  "present",
  "walkable",
  "blocksProjectile",
  "blocksPath",
  "limitsFloorView",
  "limitsFloorViewFree",
  "protectionZone",
  "noPvpZone",
  "noLogoutZone",
  "pvpZone",
  "groundSpeed",
];
for (const [key, sector] of [...sectors.entries()].sort(([a], [b]) =>
  a.localeCompare(b, "en", { numeric: true }),
)) {
  const [sx, sy, z] = key.split(",").map(Number);
  const dataLength = binaryProperties.reduce(
    (length, property) => length + sector[property].length,
    0,
  );
  const entry = Buffer.alloc(5 + dataLength);
  entry.writeUInt16LE(sx, 0);
  entry.writeUInt16LE(sy, 2);
  entry.writeUInt8(z, 4);
  let offset = 5;
  for (const property of binaryProperties) {
    entry.set(sector[property], offset);
    offset += sector[property].length;
  }
  sectorChunks.push(entry);
}
const navigationBuffer = Buffer.concat(sectorChunks);
writeFileSync(serverBinStage, navigationBuffer);
const itemHeader = Buffer.alloc(12);
itemHeader.write("TITM", 0, "ascii");
itemHeader.writeUInt8(1, 4);
itemHeader.writeUInt32LE(worldItems.length, 8);
const itemData = Buffer.alloc(worldItems.length * 9);
for (const [index, item] of worldItems.entries()) {
  if (item.stackIndex > 255) {
    throw new Error(`tile item ${item.instanceId} has an excessive stack index`);
  }
  const offset = index * 9;
  itemData.writeUInt16LE(item.position.x, offset);
  itemData.writeUInt16LE(item.position.y, offset + 2);
  itemData.writeUInt8(item.position.z, offset + 4);
  itemData.writeUInt8(item.stackIndex, offset + 5);
  itemData.writeUInt16LE(item.itemId, offset + 6);
  itemData.writeUInt8(item.classification === "mutable" ? 1 : 2, offset + 8);
}
const itemsBuffer = Buffer.concat([itemHeader, itemData]);
writeFileSync(serverItemsStage, itemsBuffer);
const worldItemAttributes = worldItems
  .filter(
    (item) =>
      Object.keys(item.attributes).length > 0 || item.contents.length > 0,
  )
  .map(({ instanceId, attributes, contents }) => ({
    instanceId,
    attributes,
    contents,
  }));
const contentDocument = JSON.stringify({
  formatVersion: sourceManifest.converters.map,
  source: {
    mapSha256: mapHash,
    canaryItemsSha256: itemSemantics.source.sha256,
  },
  name: mapName,
  otbm: {
    ...rootMetadata,
    ...mapMetadata,
  },
  waypoints,
  tileMetadata: mapTileMetadata,
  worldItemAttributes,
  disabledWorldActions: worldActions.filter((action) => !action.enabled),
  unresolvedTransitions: invalidTransitions.map(
    ({ kind, source, destination, itemId, reason }) => ({
      kind,
      source,
      destination,
      itemId,
      reason,
    }),
  ),
});
writeFileSync(serverContentStage, contentDocument);
writeFileSync(
  serverMetaStage,
  JSON.stringify({
    formatVersion: sourceManifest.converters.map,
    source: {
      mapSha256: mapHash,
      canaryItemsSha256: itemSemantics.source.sha256,
      navigationSha256: createHash("sha256")
        .update(navigationBuffer)
        .digest("hex"),
      itemsSha256: createHash("sha256").update(itemsBuffer).digest("hex"),
      contentSha256: createHash("sha256").update(contentDocument).digest("hex"),
    },
    name: mapName,
    bounds: manifest.bounds,
    spawn,
    towns,
    groundSpeeds,
    binaryProperties,
    worldItemCount: worldItems.length,
    worldActions: worldActions.filter(
      (action) => action.enabled && action.destination,
    ),
    transitions,
  }),
);
publishOutputs(
  [
    { staged: clientStage, target: clientDir },
    { staged: serverBinStage, target: join(serverDir, `${mapName}.map.bin`) },
    {
      staged: serverItemsStage,
      target: join(serverDir, `${mapName}.items.bin`),
    },
    { staged: serverMetaStage, target: join(serverDir, `${mapName}.map.json`) },
    {
      staged: serverContentStage,
      target: join(serverDir, `${mapName}.content.json`),
    },
  ],
  stagingRoot,
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
console.log(`client regions written: ${regions.size} (floors ${[...FLOORS].join(",")})`);
console.log(`server sectors written: ${sectors.size}`);
console.log(
  `server-owned map items written: ${worldItems.length} (${stats.mutableItems} mutable, ${stats.interactiveItems} interactive)`,
);
console.log(`enabled step transitions written: ${transitions.length}`);
console.log(`world actions written: ${worldActions.length}`);
console.log(`unresolved floor transitions written: ${invalidTransitions.length}`);
