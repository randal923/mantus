import { describe, expect, it } from "vitest";
import { collectWorldSeedKeys } from "./collectWorldSeedKeys";

const HEADER_SIZE = 12;
const ENTRY_SIZE = 9;

interface ItemsEntry {
  x: number;
  y: number;
  z: number;
  stackIndex: number;
  itemId: number;
  classification: number;
}

const itemsBin = (entries: ItemsEntry[]): Buffer => {
  const buffer = Buffer.alloc(HEADER_SIZE + entries.length * ENTRY_SIZE);
  buffer.write("TITM", 0, "ascii");
  buffer.writeUInt8(1, 4);
  buffer.writeUInt32LE(entries.length, 8);
  entries.forEach((entry, index) => {
    const offset = HEADER_SIZE + index * ENTRY_SIZE;
    buffer.writeUInt16LE(entry.x, offset);
    buffer.writeUInt16LE(entry.y, offset + 2);
    buffer.writeUInt8(entry.z, offset + 4);
    buffer.writeUInt8(entry.stackIndex, offset + 5);
    buffer.writeUInt16LE(entry.itemId, offset + 6);
    buffer.writeUInt8(entry.classification, offset + 8);
  });
  return buffer;
};

const contentBin = (worldItemAttributes: unknown[]): Buffer =>
  Buffer.from(JSON.stringify({ worldItemAttributes }), "utf8");

describe("collectWorldSeedKeys", () => {
  it("keys each materializable entry and skips classification 2", () => {
    const keys = collectWorldSeedKeys(
      itemsBin([
        { x: 1, y: 2, z: 7, stackIndex: 0, itemId: 1209, classification: 1 },
        { x: 5, y: 6, z: 7, stackIndex: 3, itemId: 1234, classification: 1 },
        { x: 9, y: 9, z: 7, stackIndex: 0, itemId: 9999, classification: 2 },
      ]),
      contentBin([]),
      "otservbr",
    );
    expect(keys.has("otservbr:1:2:7:0")).toBe(true);
    expect(keys.has("otservbr:5:6:7:3")).toBe(true);
    expect(keys.has("otservbr:9:9:7:0")).toBe(false);
    expect(keys.size).toBe(2);
  });

  it("includes nested container content keys recursively", () => {
    const keys = collectWorldSeedKeys(
      itemsBin([
        { x: 1, y: 1, z: 7, stackIndex: 0, itemId: 1987, classification: 1 },
      ]),
      contentBin([
        {
          instanceId: "otservbr:1:1:7:0",
          attributes: {},
          contents: [
            {
              id: 2554,
              attributes: {},
              contents: [{ id: 3031, attributes: {}, contents: [] }],
            },
          ],
        },
      ]),
      "otservbr",
    );
    expect(keys.has("otservbr:1:1:7:0")).toBe(true);
    expect(keys.has("otservbr:1:1:7:0:content:0")).toBe(true);
    expect(keys.has("otservbr:1:1:7:0:content:0:content:0")).toBe(true);
  });

  it("rejects a non-TITM items buffer", () => {
    expect(() =>
      collectWorldSeedKeys(Buffer.alloc(12), contentBin([]), "otservbr"),
    ).toThrow(/TITM/);
  });
});
