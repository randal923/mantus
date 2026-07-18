import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemRow } from "./ItemRow";
import type { PgItemLocks } from "./PgItemLocks";
import { materializeWorldItemsInsert } from "./sql/materializeWorldItemsInsert";
import type {
  WorldItemSource,
  WorldItemSourceContent,
} from "./WorldItemSource";

export class PgWorldItemMaterializer {
  constructor(
    private readonly catalog: ItemCatalog,
    private readonly mapName: string,
    private readonly locks: PgItemLocks,
  ) {}

  async lockOrMaterializeWorldItem(
    client: PoolClient,
    reference: string,
    source?: WorldItemSource,
  ): Promise<ItemRow> {
    const existing = await this.locks.findLockedItem(client, reference);
    if (existing) return existing;
    if (
      !source ||
      source.seedKey !== reference ||
      source.mapName !== this.mapName
    ) {
      throw new Error("item not found");
    }
    await this.materializeWorldItem(client, source);
    return this.locks.lockItem(client, reference);
  }

  private async materializeWorldItem(
    client: PoolClient,
    source: WorldItemSource,
  ): Promise<void> {
    const payload: Array<Record<string, unknown>> = [];
    const appendContents = (
      contents: ReadonlyArray<WorldItemSourceContent>,
      parentId: string,
      parentSeedKey: string,
    ): void => {
      for (const [slot, content] of contents.entries()) {
        const id = randomUUID();
        const seedKey = `${parentSeedKey}:content:${slot}`;
        const state = this.persistedItemState(
          content.typeId,
          content.attributes,
          seedKey,
        );
        payload.push({
          id,
          seedKey,
          typeId: content.typeId,
          count: state.count,
          attributes: state.attributes,
          locationType: "container",
          containerId: parentId,
          slotIndex: slot,
        });
        appendContents(content.contents, id, seedKey);
      }
    };
    const id = randomUUID();
    const state = this.persistedItemState(
      source.typeId,
      source.attributes,
      source.seedKey,
    );
    payload.push({
      id,
      seedKey: source.seedKey,
      typeId: source.typeId,
      count: state.count,
      attributes: state.attributes,
      locationType: "world",
      containerId: null,
      slotIndex: null,
    });
    appendContents(source.contents, id, source.seedKey);

    await client.query(materializeWorldItemsInsert, [
      source.mapName,
      source.mapVersion,
      source.position.x,
      source.position.y,
      source.position.z,
      source.stackIndex,
      JSON.stringify(payload),
    ]);
  }

  private persistedItemState(
    typeId: number,
    attributes: Readonly<Record<string, unknown>>,
    seedKey: string,
  ): { count: number; attributes: Readonly<Record<string, unknown>> } {
    const type = this.catalog.require(typeId);
    if (!type.stackable) {
      return { count: 1, attributes: { ...attributes } };
    }
    const rawCount = attributes.count;
    const count =
      rawCount === undefined || rawCount === 0 ? 1 : Number(rawCount);
    if (!Number.isInteger(count) || count < 1 || count > type.maxCount) {
      throw new Error(`world item ${seedKey} has an invalid stack count`);
    }
    const { count: _count, ...persisted } = attributes;
    return { count, attributes: persisted };
  }
}
