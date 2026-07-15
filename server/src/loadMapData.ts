import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { positionSchema, type Position } from "@tibia/protocol";
import type { MapAction } from "./MapAction";
import type { MapData, MapTile } from "./MapData";
import type { MapTransition } from "./MapTransition";
import { loadMapItems } from "./loadMapItems";
import { positionKey } from "./positionKey";

const VERSION_THREE_PROPERTIES = [
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
] as const;

interface MapMeta {
  formatVersion?: number;
  source?: {
    navigationSha256?: string;
    itemsSha256?: string;
    contentSha256?: string;
  };
  towns: Array<{ id?: number; name: string; x: number; y: number; z: number }>;
  spawn: { x: number; y: number; z: number };
  groundSpeeds?: number[];
  binaryProperties?: string[];
  worldItemCount?: number;
  transitions?: unknown[];
  worldActions?: unknown[];
}

interface MapSector {
  present: Buffer;
  walkable: Buffer;
  blocksProjectile?: Buffer;
  blocksPath?: Buffer;
  limitsFloorView?: Buffer;
  limitsFloorViewFree?: Buffer;
  protectionZone?: Buffer;
  noPvpZone?: Buffer;
  noLogoutZone?: Buffer;
  pvpZone?: Buffer;
  groundSpeed?: Buffer;
}

function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function bitIsSet(buffer: Buffer | undefined, bit: number): boolean {
  if (!buffer) return false;
  return ((buffer[bit >> 3] ?? 0) & (1 << (bit & 7))) !== 0;
}

function readPackedFiveBit(buffer: Buffer, index: number): number {
  const bitOffset = index * 5;
  const byteOffset = bitOffset >> 3;
  const shift = bitOffset & 7;
  return (((buffer[byteOffset] ?? 0) | ((buffer[byteOffset + 1] ?? 0) << 8)) >> shift) & 0x1f;
}

function parseTransition(value: unknown, legacy: boolean): MapTransition {
  if (!value || typeof value !== "object") {
    throw new Error("invalid map transition metadata");
  }
  const transition = value as Record<string, unknown>;
  const source = positionSchema.safeParse(transition.source);
  const destination = positionSchema.safeParse(transition.destination);
  const kinds = new Set(["floor-change", "hole", "teleport"]);
  if (
    !kinds.has(String(transition.kind)) ||
    (!legacy && transition.activation !== "step") ||
    !source.success ||
    !destination.success ||
    !Number.isInteger(transition.itemId) ||
    Number(transition.itemId) <= 0
  ) {
    throw new Error("invalid map transition metadata");
  }
  return {
    kind: transition.kind as MapTransition["kind"],
    activation: "step",
    source: source.data,
    destination: destination.data,
    itemId: Number(transition.itemId),
  };
}

function parseAction(value: unknown): MapAction {
  if (!value || typeof value !== "object") {
    throw new Error("invalid map action metadata");
  }
  const action = value as Record<string, unknown>;
  const source = positionSchema.safeParse(action.source);
  const destination = positionSchema.safeParse(action.destination);
  if (
    action.kind !== "ladder" ||
    action.activation !== "use" ||
    !source.success ||
    !destination.success ||
    !Number.isInteger(action.itemId) ||
    Number(action.itemId) <= 0
  ) {
    throw new Error("invalid map action metadata");
  }
  return {
    kind: "ladder",
    activation: "use",
    source: source.data,
    destination: destination.data,
    itemId: Number(action.itemId),
  };
}

export function loadMapData(
  dataDir: string,
  name: string,
  spawnTown?: string,
): MapData {
  const meta = JSON.parse(
    readFileSync(join(dataDir, `${name}.map.json`), "utf8"),
  ) as MapMeta;
  const navigation = readFileSync(join(dataDir, `${name}.map.bin`));
  if (navigation.length < 12 || navigation.toString("ascii", 0, 4) !== "TMAP") {
    throw new Error(`${name}.map.bin is not a TMAP file`);
  }
  const version = navigation.readUInt8(4);
  if (![1, 2, 3].includes(version)) {
    throw new Error(`${name}.map.bin has unsupported format version ${version}`);
  }
  if (version >= 2 && meta.formatVersion !== version) {
    throw new Error(`${name} map metadata does not match its navigation data`);
  }
  let getItems: MapData["getItems"] = () => [];
  if (version === 3) {
    const source = meta.source;
    if (
      JSON.stringify(meta.binaryProperties) !==
      JSON.stringify(VERSION_THREE_PROPERTIES)
    ) {
      throw new Error(`${name} map metadata has an unsupported binary layout`);
    }
    if (!source || source.navigationSha256 !== sha256(navigation)) {
      throw new Error(`${name}.map.bin does not match its source hash`);
    }
    const items = readFileSync(join(dataDir, `${name}.items.bin`));
    if (source.itemsSha256 !== sha256(items)) {
      throw new Error(`${name}.items.bin does not match its source hash`);
    }
    const content = readFileSync(join(dataDir, `${name}.content.json`));
    if (source.contentSha256 !== sha256(content)) {
      throw new Error(`${name}.content.json does not match its source hash`);
    }
    if (!Number.isInteger(meta.worldItemCount) || Number(meta.worldItemCount) < 0) {
      throw new Error(`${name} map metadata has an invalid world-item count`);
    }
    getItems = loadMapItems(items, name, Number(meta.worldItemCount));
  }

  const sectorSize = navigation.readUInt8(5);
  if (sectorSize === 0 || (sectorSize * sectorSize) % 8 !== 0) {
    throw new Error(`${name}.map.bin has an invalid sector size`);
  }
  const sectorCount = navigation.readUInt32LE(8);
  const bitsetBytes = (sectorSize * sectorSize) / 8;
  const packedGroundSpeedBytes = (sectorSize * sectorSize * 5) / 8;
  const entrySize =
    version === 1
      ? 5 + bitsetBytes
      : version === 2
        ? 5 + bitsetBytes * 2
        : 5 + bitsetBytes * 10 + packedGroundSpeedBytes;
  if (navigation.length !== 12 + sectorCount * entrySize) {
    throw new Error(`${name}.map.bin sector count does not match its length`);
  }
  const sectors = new Map<string, MapSector>();
  let offset = 12;
  for (let index = 0; index < sectorCount; index++) {
    const sx = navigation.readUInt16LE(offset);
    const sy = navigation.readUInt16LE(offset + 2);
    const z = navigation.readUInt8(offset + 4);
    if (z > 15) throw new Error(`${name}.map.bin contains an invalid floor`);
    const key = positionKey({ x: sx, y: sy, z });
    if (sectors.has(key)) throw new Error(`${name}.map.bin has duplicate sectors`);
    let dataOffset = offset + 5;
    const readBytes = (length: number) => {
      const bytes = navigation.subarray(dataOffset, dataOffset + length);
      dataOffset += length;
      return bytes;
    };
    const present = readBytes(bitsetBytes);
    const walkable = version === 1 ? present : readBytes(bitsetBytes);
    const sector: MapSector = { present, walkable };
    if (version === 3) {
      sector.blocksProjectile = readBytes(bitsetBytes);
      sector.blocksPath = readBytes(bitsetBytes);
      sector.limitsFloorView = readBytes(bitsetBytes);
      sector.limitsFloorViewFree = readBytes(bitsetBytes);
      sector.protectionZone = readBytes(bitsetBytes);
      sector.noPvpZone = readBytes(bitsetBytes);
      sector.noLogoutZone = readBytes(bitsetBytes);
      sector.pvpZone = readBytes(bitsetBytes);
      sector.groundSpeed = readBytes(packedGroundSpeedBytes);
    }
    sectors.set(key, sector);
    offset += entrySize;
  }

  const groundSpeeds = meta.groundSpeeds ?? [150];
  if (
    groundSpeeds.length === 0 ||
    groundSpeeds.length > 32 ||
    groundSpeeds.some((speed) => !Number.isInteger(speed) || speed < 0)
  ) {
    throw new Error(`${name} map metadata has invalid ground speeds`);
  }
  const getTile = (position: Position): MapTile | undefined => {
    const { x, y, z } = position;
    if (x < 0 || y < 0 || z < 0 || z > 15) return undefined;
    const sector = sectors.get(
      positionKey({
        x: Math.floor(x / sectorSize),
        y: Math.floor(y / sectorSize),
        z,
      }),
    );
    if (!sector) return undefined;
    const bit = (y % sectorSize) * sectorSize + (x % sectorSize);
    if (!bitIsSet(sector.present, bit)) return undefined;
    const walkable = bitIsSet(sector.walkable, bit);
    const groundSpeedIndex = sector.groundSpeed
      ? readPackedFiveBit(sector.groundSpeed, bit)
      : 0;
    const groundSpeed = version === 3 ? groundSpeeds[groundSpeedIndex] : 150;
    if (groundSpeed === undefined) {
      throw new Error(`${name}.map.bin references an unknown ground speed`);
    }
    return {
      walkable,
      pathable: walkable && !bitIsSet(sector.blocksPath, bit),
      groundSpeed,
      blocksProjectile: bitIsSet(sector.blocksProjectile, bit),
      limitsFloorView:
        version === 3 ? bitIsSet(sector.limitsFloorView, bit) : true,
      limitsFloorViewFree:
        version === 3 ? bitIsSet(sector.limitsFloorViewFree, bit) : true,
      protectionZone: bitIsSet(sector.protectionZone, bit),
      noPvpZone: bitIsSet(sector.noPvpZone, bit),
      noLogoutZone: bitIsSet(sector.noLogoutZone, bit),
      pvpZone: bitIsSet(sector.pvpZone, bit),
    };
  };

  const transitions = new Map<string, MapTransition>();
  for (const value of meta.transitions ?? []) {
    const transition = parseTransition(value, version < 3);
    const key = positionKey(transition.source);
    if (
      transitions.has(key) ||
      !getTile(transition.source)?.walkable ||
      !getTile(transition.destination)?.walkable
    ) {
      throw new Error(`${name} has duplicate or invalid transition metadata at ${key}`);
    }
    transitions.set(key, transition);
  }
  const actions = new Map<string, MapAction>();
  for (const value of meta.worldActions ?? []) {
    const action = parseAction(value);
    const key = positionKey(action.source);
    if (actions.has(key) || !getTile(action.destination)?.walkable) {
      throw new Error(`${name} has duplicate or invalid map action at ${key}`);
    }
    actions.set(key, action);
  }

  const named = meta.towns.find(
    (town) => town.name.toLowerCase() === spawnTown?.toLowerCase(),
  );
  const spawnSource = named ?? meta.towns[0] ?? meta.spawn;
  const spawnResult = positionSchema.safeParse({
    x: spawnSource.x,
    y: spawnSource.y,
    z: spawnSource.z,
  });
  if (!spawnResult.success) throw new Error(`map ${name} has an invalid spawn`);

  return {
    name,
    spawn: spawnResult.data,
    getTile,
    isWalkable(position, pathfinding = false) {
      const tile = getTile(position);
      return pathfinding ? (tile?.pathable ?? false) : (tile?.walkable ?? false);
    },
    getGroundSpeed(position) {
      return getTile(position)?.groundSpeed;
    },
    blocksProjectile(position) {
      return getTile(position)?.blocksProjectile ?? true;
    },
    getTransition(position) {
      return transitions.get(positionKey(position));
    },
    getAction(position) {
      return actions.get(positionKey(position));
    },
    getItems,
  };
}
