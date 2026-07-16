import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ItemStore } from "./ItemStore";
import type { WorldItemDeltas } from "./WorldItemDeltas";

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates the converted map version and loads only persisted item deltas.
 * Base map items are materialized atomically when first mutated, avoiding
 * millions of unused database and audit rows at startup.
 */
export class WorldItemSeeder {
  constructor(
    private readonly store: ItemStore,
    private readonly dataDirectory: string,
    private readonly mapName: string,
  ) {}

  async prepare(): Promise<WorldItemDeltas> {
    const meta: unknown = JSON.parse(
      await readFile(join(this.dataDirectory, `${this.mapName}.map.json`), "utf8"),
    );
    if (!isRecord(meta) || !isRecord(meta.source)) {
      throw new Error(`${this.mapName} has invalid map metadata`);
    }
    const expectedItemsHash = meta.source.itemsSha256;
    const mapHash = meta.source.mapSha256;
    if (typeof expectedItemsHash !== "string" || typeof mapHash !== "string") {
      throw new Error(`${this.mapName} has incomplete item source hashes`);
    }
    const itemsBuffer = await readFile(
      join(this.dataDirectory, `${this.mapName}.items.bin`),
    );
    if (sha256(itemsBuffer) !== expectedItemsHash) {
      throw new Error(`${this.mapName}.items.bin does not match map metadata`);
    }
    return this.store.loadWorldDeltas(
      this.mapName,
      sha256(`${mapHash}:${expectedItemsHash}`),
    );
  }
}
