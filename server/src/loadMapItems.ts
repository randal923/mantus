import type { Position } from "@tibia/protocol";
import type { ItemCatalog } from "./item/ItemCatalog";
import type { WorldItemSourceData } from "./item/WorldItemSource";
import type { MapItem } from "./MapItem";

const HEADER_SIZE = 12;
const ENTRY_SIZE = 9;

interface ItemEntry {
  x: number;
  y: number;
  z: number;
  stackIndex: number;
  itemId: number;
  classification: number;
}

function readEntry(buffer: Buffer, index: number): ItemEntry {
  const offset = HEADER_SIZE + index * ENTRY_SIZE;
  return {
    x: buffer.readUInt16LE(offset),
    y: buffer.readUInt16LE(offset + 2),
    z: buffer.readUInt8(offset + 4),
    stackIndex: buffer.readUInt8(offset + 5),
    itemId: buffer.readUInt16LE(offset + 6),
    classification: buffer.readUInt8(offset + 8),
  };
}

function comparePosition(entry: ItemEntry, position: Position): number {
  return entry.z - position.z || entry.y - position.y || entry.x - position.x;
}

/** comparePosition against the raw buffer without materializing an entry. */
function comparePositionAt(
  buffer: Buffer,
  index: number,
  position: Position,
): number {
  const offset = HEADER_SIZE + index * ENTRY_SIZE;
  return (
    buffer.readUInt8(offset + 4) - position.z ||
    buffer.readUInt16LE(offset + 2) - position.y ||
    buffer.readUInt16LE(offset) - position.x
  );
}

const NO_ITEMS: ReadonlyArray<MapItem> = [];

function mapItemCount(
  itemId: number,
  instanceId: string,
  source: WorldItemSourceData | undefined,
  catalog: ItemCatalog | undefined,
): number {
  if (!catalog) return 1;
  const type = catalog.require(itemId);
  if (!type.stackable) return 1;
  const rawCount = source?.attributes.count;
  if (rawCount === undefined || rawCount === 0) return 1;
  if (
    !Number.isInteger(rawCount) ||
    Number(rawCount) < 1 ||
    Number(rawCount) > type.maxCount
  ) {
    throw new Error(`world item ${instanceId} has an invalid stack count`);
  }
  return Number(rawCount);
}

export function loadMapItems(
  buffer: Buffer,
  mapName: string,
  expectedCount: number,
  mapVersion: string,
  sources: ReadonlyMap<string, WorldItemSourceData>,
  catalog?: ItemCatalog,
): (position: Position) => ReadonlyArray<MapItem> {
  if (buffer.length < HEADER_SIZE || buffer.toString("ascii", 0, 4) !== "TITM") {
    throw new Error(`${mapName}.items.bin is not a TITM file`);
  }
  if (buffer.readUInt8(4) !== 1) {
    throw new Error(`${mapName}.items.bin has an unsupported format version`);
  }
  const count = buffer.readUInt32LE(8);
  if (count !== expectedCount || buffer.length !== HEADER_SIZE + count * ENTRY_SIZE) {
    throw new Error(`${mapName}.items.bin count or length does not match metadata`);
  }
  let previous: ItemEntry | undefined;
  let itemsOnTile = 0;
  for (let index = 0; index < count; index++) {
    const entry = readEntry(buffer, index);
    if (entry.z > 15 || entry.itemId === 0 || ![1, 2].includes(entry.classification)) {
      throw new Error(`${mapName}.items.bin contains invalid item data`);
    }
    if (previous) {
      const positionOrder =
        previous.z - entry.z ||
        previous.y - entry.y ||
        previous.x - entry.x;
      const order = positionOrder || previous.stackIndex - entry.stackIndex;
      if (order >= 0) {
        throw new Error(`${mapName}.items.bin is unsorted or has duplicate items`);
      }
      itemsOnTile = positionOrder === 0 ? itemsOnTile + 1 : 1;
    } else {
      itemsOnTile = 1;
    }
    if (itemsOnTile > 16) {
      throw new Error(`${mapName}.items.bin has too many items on one tile`);
    }
    previous = entry;
  }

  return (position) => {
    let low = 0;
    let high = count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (comparePositionAt(buffer, middle, position) < 0) low = middle + 1;
      else high = middle;
    }
    if (low >= count || comparePositionAt(buffer, low, position) !== 0) {
      return NO_ITEMS;
    }
    const items: MapItem[] = [];
    for (let index = low; index < count; index++) {
      const entry = readEntry(buffer, index);
      if (comparePosition(entry, position) !== 0) break;
      if (entry.classification !== 1) continue;
      const instanceId = `${mapName}:${entry.x}:${entry.y}:${entry.z}:${entry.stackIndex}`;
      const source = sources.get(instanceId);
      items.push({
        instanceId,
        itemId: entry.itemId,
        stackIndex: entry.stackIndex,
        mutable: true,
        revision: 1,
        count: mapItemCount(entry.itemId, instanceId, source, catalog),
        source: {
          seedKey: instanceId,
          mapName,
          mapVersion,
          typeId: entry.itemId,
          attributes: source?.attributes ?? {},
          position: { x: entry.x, y: entry.y, z: entry.z },
          stackIndex: entry.stackIndex,
          contents: source?.contents ?? [],
        },
      });
    }
    return items;
  };
}
