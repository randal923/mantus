import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMapData } from "./loadMapData";

const SECTOR_SIZE = 32;
const BYTES_PER_SECTOR = (SECTOR_SIZE * SECTOR_SIZE) / 8;
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
});
