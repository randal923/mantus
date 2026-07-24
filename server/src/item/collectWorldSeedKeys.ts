import { loadWorldItemSources } from "./loadWorldItemSources";
import type { WorldItemSourceContent } from "./WorldItemSource";

const HEADER_SIZE = 12;
const ENTRY_SIZE = 9;

/**
 * Every seed key the current map data can produce, matching how
 * `loadMapItems`/`PgWorldItemMaterializer` derive them:
 * - each materializable (classification 1) items.bin entry →
 *   `${mapName}:${x}:${y}:${z}:${stackIndex}`;
 * - each nested container content → `${parentSeedKey}:content:${slot}`.
 *
 * A persisted delta row whose seed_key is absent from this set no longer has a
 * seed fixture in the new map and must not be blind-deleted (reconcileWorldSeed
 * treats it as unclassifiable).
 */
export function collectWorldSeedKeys(
  itemsBuffer: Buffer,
  contentBuffer: Buffer,
  mapName: string,
): Set<string> {
  if (
    itemsBuffer.length < HEADER_SIZE ||
    itemsBuffer.toString("ascii", 0, 4) !== "TITM"
  ) {
    throw new Error(`${mapName}.items.bin is not a TITM file`);
  }
  if (itemsBuffer.readUInt8(4) !== 1) {
    throw new Error(`${mapName}.items.bin has an unsupported format version`);
  }
  const count = itemsBuffer.readUInt32LE(8);
  if (itemsBuffer.length !== HEADER_SIZE + count * ENTRY_SIZE) {
    throw new Error(`${mapName}.items.bin length does not match its count`);
  }

  const keys = new Set<string>();
  for (let index = 0; index < count; index++) {
    const offset = HEADER_SIZE + index * ENTRY_SIZE;
    if (itemsBuffer.readUInt8(offset + 8) !== 1) continue;
    const x = itemsBuffer.readUInt16LE(offset);
    const y = itemsBuffer.readUInt16LE(offset + 2);
    const z = itemsBuffer.readUInt8(offset + 4);
    const stackIndex = itemsBuffer.readUInt8(offset + 5);
    keys.add(`${mapName}:${x}:${y}:${z}:${stackIndex}`);
  }

  const addContents = (
    parentKey: string,
    contents: ReadonlyArray<WorldItemSourceContent>,
  ): void => {
    contents.forEach((content, slot) => {
      const key = `${parentKey}:content:${slot}`;
      keys.add(key);
      addContents(key, content.contents);
    });
  };
  for (const [instanceId, data] of loadWorldItemSources(
    contentBuffer,
    mapName,
  )) {
    addContents(instanceId, data.contents);
  }

  return keys;
}
