import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryItemStore } from "./MemoryItemStore";
import { WorldItemSeeder } from "./WorldItemSeeder";

class DeltaItemStore extends MemoryItemStore {
  deltaLoads = 0;

  override async loadWorldDeltas() {
    this.deltaLoads++;
    return { hiddenSeedKeys: [], items: [] };
  }
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("WorldItemSeeder", () => {
  it("validates the map and loads deltas without eagerly inserting base items", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tibia-world-items-"));
    temporaryDirectories.push(directory);
    const itemBuffer = Buffer.alloc(12);
    itemBuffer.write("TITM", 0, "ascii");
    itemBuffer.writeUInt8(1, 4);
    const itemHash = createHash("sha256").update(itemBuffer).digest("hex");
    await Promise.all([
      writeFile(join(directory, "test.items.bin"), itemBuffer),
      writeFile(
        join(directory, "test.map.json"),
        JSON.stringify({
          source: { itemsSha256: itemHash, mapSha256: "map-hash" },
        }),
      ),
    ]);
    const store = new DeltaItemStore();
    const seeder = new WorldItemSeeder(store, directory, "test");

    await seeder.prepare();
    await seeder.prepare();

    expect(store.deltaLoads).toBe(2);
  });
});
