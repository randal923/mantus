import type { Pool } from "pg";
import type { Item } from "./Item";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import { changedSeededItemsQuery } from "./sql/changedSeededItemsQuery";
import { incompatibleSeedsQuery } from "./sql/incompatibleSeedsQuery";
import { ownedItemAgesQuery } from "./sql/ownedItemAgesQuery";
import { ownedItemsQuery } from "./sql/ownedItemsQuery";
import { worldTreeItemsQuery } from "./sql/worldTreeItemsQuery";
import type { WorldItemDeltas } from "./WorldItemDeltas";

export class PgItemReads {
  constructor(private readonly pool: Pool) {}

  async loadForCharacter(characterId: string): Promise<ReadonlyArray<Item>> {
    const result = await this.pool.query<ItemRow>(ownedItemsQuery, [
      characterId,
    ]);
    if (result.rows.length > 500) {
      throw new Error(`character ${characterId} has excessive nested items`);
    }
    return result.rows.map(itemFromRow);
  }

  async carriedAgesMs(
    characterId: string,
  ): Promise<ReadonlyMap<string, number>> {
    const result = await this.pool.query<{ id: string; age_ms: string }>(
      ownedItemAgesQuery,
      [characterId],
    );
    return new Map(result.rows.map((row) => [row.id, Number(row.age_ms)]));
  }

  async loadWorldDeltas(
    mapName: string,
    mapVersion: string,
  ): Promise<WorldItemDeltas> {
    const incompatible = await this.pool.query(incompatibleSeedsQuery, [
      mapName,
      mapVersion,
    ]);
    if (incompatible.rowCount) {
      throw new Error(
        "persisted world items require reconciliation for this map version",
      );
    }
    const changed = await this.pool.query<ItemRow>(changedSeededItemsQuery, [
      mapName,
      mapVersion,
    ]);
    const worldTrees = await this.pool.query<ItemRow & { age_ms: string }>(
      worldTreeItemsQuery,
      [mapName],
    );
    return {
      hiddenSeedKeys: changed.rows.flatMap((row) =>
        row.seed_key ? [row.seed_key] : [],
      ),
      items: worldTrees.rows.map(itemFromRow),
      agesMs: new Map(
        worldTrees.rows.map((row) => [row.id, Number(row.age_ms)]),
      ),
    };
  }
}
