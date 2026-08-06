import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The navigation slice of a converted map, read straight from the files the
 * server loads: `<name>.map.bin` for per-tile walkability and
 * `<name>.map.json` for towns, step transitions and use-activated links.
 *
 * Deliberately a re-read rather than a call into `server/src/loadMapData.ts`:
 * tools are plain ESM scripts, and this only needs geometry — no items, no
 * houses, no hashes to verify. The bit layout is the one `convertOtbm.mjs`
 * writes.
 */

const SECTOR_SIZE = 32;
const BITSET_BYTES = (SECTOR_SIZE * SECTOR_SIZE) / 8;
const GROUND_SPEED_BYTES = (SECTOR_SIZE * SECTOR_SIZE * 5) / 8;
const BITSET_PROPERTIES = [
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
];
const ENTRY_BYTES =
  5 + BITSET_PROPERTIES.length * BITSET_BYTES + GROUND_SPEED_BYTES;

export function readMapGeometry(dataDir, name) {
  const meta = JSON.parse(readFileSync(join(dataDir, `${name}.map.json`), "utf8"));
  if (meta.formatVersion !== 3) {
    throw new Error(`${name} map metadata has an unsupported format version`);
  }
  const navigation = readFileSync(join(dataDir, `${name}.map.bin`));
  if (navigation.toString("ascii", 0, 4) !== "TMAP") {
    throw new Error(`${name}.map.bin is not a TMAP file`);
  }
  if (navigation.readUInt8(5) !== SECTOR_SIZE) {
    throw new Error(`${name}.map.bin has an unsupported sector size`);
  }
  const sectorCount = navigation.readUInt32LE(8);
  const sectors = new Map();
  for (let index = 0; index < sectorCount; index += 1) {
    const offset = 12 + index * ENTRY_BYTES;
    const sx = navigation.readUInt16LE(offset);
    const sy = navigation.readUInt16LE(offset + 2);
    const z = navigation.readUInt8(offset + 4);
    sectors.set(`${sx},${sy},${z}`, offset + 5);
  }

  const groundSpeeds = meta.groundSpeeds ?? [];
  const walkableOffset = BITSET_PROPERTIES.indexOf("walkable") * BITSET_BYTES;
  const protectionOffset =
    BITSET_PROPERTIES.indexOf("protectionZone") * BITSET_BYTES;
  const groundSpeedOffset = BITSET_PROPERTIES.length * BITSET_BYTES;

  const sectorOffset = (position) =>
    sectors.get(
      `${Math.floor(position.x / SECTOR_SIZE)},${Math.floor(position.y / SECTOR_SIZE)},${position.z}`,
    );
  const tileBit = (position) =>
    (position.y % SECTOR_SIZE) * SECTOR_SIZE + (position.x % SECTOR_SIZE);

  const isWalkable = (position) => {
    const base = sectorOffset(position);
    if (base === undefined) return false;
    const bit = tileBit(position);
    return (
      (navigation[base + walkableOffset + (bit >> 3)] & (1 << (bit & 7))) !== 0
    );
  };

  const isProtectionZone = (position) => {
    const base = sectorOffset(position);
    if (base === undefined) return false;
    const bit = tileBit(position);
    return (
      (navigation[base + protectionOffset + (bit >> 3)] & (1 << (bit & 7))) !== 0
    );
  };

  const getGroundSpeed = (position) => {
    const base = sectorOffset(position);
    if (base === undefined) return undefined;
    const bitOffset = tileBit(position) * 5;
    const byteOffset = base + groundSpeedOffset + (bitOffset >> 3);
    const packed =
      ((navigation[byteOffset] | (navigation[byteOffset + 1] << 8)) >>
        (bitOffset & 7)) &
      0x1f;
    return groundSpeeds[packed];
  };

  const transitions = new Map();
  for (const transition of meta.transitions ?? []) {
    transitions.set(positionKey(transition.source), transition);
  }
  const actions = (meta.worldActions ?? []).filter(
    (action) => action.enabled !== false,
  );

  return {
    bounds: meta.bounds,
    towns: meta.towns,
    isWalkable,
    isProtectionZone,
    getGroundSpeed,
    getTransition: (position) => transitions.get(positionKey(position)),
    transitions: [...transitions.values()],
    actions,
  };
}

function positionKey(position) {
  return `${position.x},${position.y},${position.z}`;
}
