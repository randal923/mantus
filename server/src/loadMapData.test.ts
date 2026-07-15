import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMapData } from "./loadMapData";

const SECTOR_SIZE = 32;
const BYTES_PER_SECTOR = (SECTOR_SIZE * SECTOR_SIZE) / 8;
const GROUND_SPEED_BYTES = (SECTOR_SIZE * SECTOR_SIZE * 5) / 8;
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
];
const directories: string[] = [];

const sector = (z: number): Buffer => {
  const entry = Buffer.alloc(5 + BYTES_PER_SECTOR);
  entry.writeUInt8(z, 4);
  const bit = 2 * SECTOR_SIZE + 1;
  const byteOffset = 5 + (bit >> 3);
  entry.writeUInt8(
    entry.readUInt8(byteOffset) | (1 << (bit & 7)),
    byteOffset,
  );
  return entry;
};

const sectorV2 = (
  z: number,
  tiles: ReadonlyArray<{ x: number; y: number; walkable: boolean }>,
): Buffer => {
  const entry = Buffer.alloc(5 + BYTES_PER_SECTOR * 2);
  entry.writeUInt8(z, 4);
  for (const tile of tiles) {
    const bit = tile.y * SECTOR_SIZE + tile.x;
    const byteOffset = 5 + (bit >> 3);
    const mask = 1 << (bit & 7);
    entry.writeUInt8(entry.readUInt8(byteOffset) | mask, byteOffset);
    if (tile.walkable) {
      const walkableOffset = byteOffset + BYTES_PER_SECTOR;
      entry.writeUInt8(
        entry.readUInt8(walkableOffset) | mask,
        walkableOffset,
      );
    }
  }
  return entry;
};

const sectorV3 = (): Buffer => {
  const entry = Buffer.alloc(5 + BYTES_PER_SECTOR * 10 + GROUND_SPEED_BYTES);
  entry.writeUInt8(7, 4);
  const bit = 2 * SECTOR_SIZE + 1;
  for (const propertyIndex of [0, 1, 2, 4, 5, 6]) {
    const offset = 5 + propertyIndex * BYTES_PER_SECTOR + (bit >> 3);
    entry.writeUInt8(entry.readUInt8(offset) | (1 << (bit & 7)), offset);
  }
  const groundOffset = 5 + BYTES_PER_SECTOR * 10;
  const packedBit = bit * 5;
  const byteOffset = groundOffset + (packedBit >> 3);
  const shift = packedBit & 7;
  entry.writeUInt8(entry.readUInt8(byteOffset) | (1 << shift), byteOffset);
  if (shift > 3) {
    entry.writeUInt8(
      entry.readUInt8(byteOffset + 1) | (1 >> (8 - shift)),
      byteOffset + 1,
    );
  }
  return entry;
};

const hash = (buffer: Buffer | string) =>
  createHash("sha256").update(buffer).digest("hex");

describe("loadMapData", () => {
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("loads walkability independently for every floor", () => {
    const directory = mkdtempSync(join(tmpdir(), "tibia-map-"));
    directories.push(directory);
    const header = Buffer.alloc(12);
    header.write("TMAP", 0, "ascii");
    header.writeUInt8(1, 4);
    header.writeUInt8(SECTOR_SIZE, 5);
    header.writeUInt32LE(2, 8);
    writeFileSync(
      join(directory, "fixture.map.bin"),
      Buffer.concat([header, sector(7), sector(8)]),
    );
    writeFileSync(
      join(directory, "fixture.map.json"),
      JSON.stringify({
        towns: [{ name: "Temple", x: 1, y: 2, z: 7 }],
        spawn: { x: 1, y: 2, z: 7 },
      }),
    );

    const map = loadMapData(directory, "fixture", "Temple");

    expect(map.isWalkable({ x: 1, y: 2, z: 7 })).toBe(true);
    expect(map.isWalkable({ x: 1, y: 2, z: 8 })).toBe(true);
    expect(map.isWalkable({ x: 1, y: 2, z: 6 })).toBe(false);
  });

  it("distinguishes blocked tiles and loads explicit floor transitions", () => {
    const directory = mkdtempSync(join(tmpdir(), "tibia-map-"));
    directories.push(directory);
    const header = Buffer.alloc(12);
    header.write("TMAP", 0, "ascii");
    header.writeUInt8(2, 4);
    header.writeUInt8(SECTOR_SIZE, 5);
    header.writeUInt32LE(2, 8);
    writeFileSync(
      join(directory, "fixture.map.bin"),
      Buffer.concat([
        header,
        sectorV2(7, [
          { x: 1, y: 2, walkable: true },
          { x: 2, y: 2, walkable: false },
        ]),
        sectorV2(6, [{ x: 1, y: 1, walkable: true }]),
      ]),
    );
    const transition = {
      kind: "floor-change",
      activation: "step",
      source: { x: 1, y: 2, z: 7 },
      destination: { x: 1, y: 1, z: 6 },
      itemId: 1947,
    } as const;
    writeFileSync(
      join(directory, "fixture.map.json"),
      JSON.stringify({
        formatVersion: 2,
        towns: [{ name: "Temple", x: 1, y: 2, z: 7 }],
        spawn: { x: 1, y: 2, z: 7 },
        transitions: [transition],
      }),
    );

    const map = loadMapData(directory, "fixture", "Temple");

    expect(map.getTile({ x: 2, y: 2, z: 7 })).toMatchObject({
      walkable: false,
      pathable: false,
      groundSpeed: 150,
    });
    expect(map.getTile({ x: 3, y: 2, z: 7 })).toBeUndefined();
    expect(map.getTransition(transition.source, "north")).toEqual(transition);
  });

  it("loads version-three tile semantics and server-owned visible items", () => {
    const directory = mkdtempSync(join(tmpdir(), "tibia-map-"));
    directories.push(directory);
    const header = Buffer.alloc(12);
    header.write("TMAP", 0, "ascii");
    header.writeUInt8(3, 4);
    header.writeUInt8(SECTOR_SIZE, 5);
    header.writeUInt32LE(1, 8);
    const navigation = Buffer.concat([header, sectorV3()]);
    const itemHeader = Buffer.alloc(12);
    itemHeader.write("TITM", 0, "ascii");
    itemHeader.writeUInt8(1, 4);
    itemHeader.writeUInt32LE(1, 8);
    const item = Buffer.alloc(9);
    item.writeUInt16LE(1, 0);
    item.writeUInt16LE(2, 2);
    item.writeUInt8(7, 4);
    item.writeUInt8(3, 5);
    item.writeUInt16LE(3003, 6);
    item.writeUInt8(1, 8);
    const items = Buffer.concat([itemHeader, item]);
    const content = "{}";
    writeFileSync(join(directory, "fixture.map.bin"), navigation);
    writeFileSync(join(directory, "fixture.items.bin"), items);
    writeFileSync(join(directory, "fixture.content.json"), content);
    writeFileSync(
      join(directory, "fixture.map.json"),
      JSON.stringify({
        formatVersion: 3,
        source: {
          navigationSha256: hash(navigation),
          itemsSha256: hash(items),
          contentSha256: hash(content),
        },
        binaryProperties: VERSION_THREE_PROPERTIES,
        groundSpeeds: [100, 150],
        worldItemCount: 1,
        towns: [{ name: "Temple", x: 1, y: 2, z: 7 }],
        spawn: { x: 1, y: 2, z: 7 },
        transitions: [],
        worldActions: [
          {
            kind: "ladder",
            activation: "use",
            source: { x: 1, y: 2, z: 7 },
            destination: { x: 1, y: 2, z: 7 },
            itemId: 1948,
          },
        ],
      }),
    );

    const map = loadMapData(directory, "fixture", "Temple");

    expect(map.getTile({ x: 1, y: 2, z: 7 })).toEqual({
      walkable: true,
      pathable: true,
      groundSpeed: 150,
      blocksProjectile: true,
      limitsFloorView: true,
      limitsFloorViewFree: true,
      protectionZone: true,
      noPvpZone: false,
      noLogoutZone: false,
      pvpZone: false,
    });
    expect(map.getItems({ x: 1, y: 2, z: 7 })).toEqual([
      {
        instanceId: "fixture:1:2:7:3",
        itemId: 3003,
        stackIndex: 3,
        mutable: true,
      },
    ]);
    expect(map.getAction({ x: 1, y: 2, z: 7 })).toEqual({
      kind: "ladder",
      activation: "use",
      source: { x: 1, y: 2, z: 7 },
      destination: { x: 1, y: 2, z: 7 },
      itemId: 1948,
    });
  });
});
