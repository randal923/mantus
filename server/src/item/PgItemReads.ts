import type { Pool } from "pg";
import type { Item } from "./Item";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import { changedSeededItemsQuery } from "./sql/changedSeededItemsQuery";
import { droppedWorldItemsQuery } from "./sql/droppedWorldItemsQuery";
import { incompatibleSeedsQuery } from "./sql/incompatibleSeedsQuery";
import { ownedItemsQuery } from "./sql/ownedItemsQuery";
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
    const dropped = await this.pool.query<ItemRow>(droppedWorldItemsQuery, [
      mapName,
    ]);
    return {
      hiddenSeedKeys: changed.rows.flatMap((row) =>
        row.seed_key ? [row.seed_key] : [],
      ),
      items: [...changed.rows, ...dropped.rows]
        .filter((row) => row.location_type === "world")
        .map(itemFromRow),
    };
  }
}
