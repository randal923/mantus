import type { Pool } from "pg";
import type { EquipmentSlot } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemLocation } from "../item/ItemLocation";
import type { DepotItemRow } from "./DepotItemRow";
import { itemFromRow } from "./itemFromRow";
import type { LoadedDepot } from "./LoadedDepot";
import { storedStateQuery } from "./sql/storedStateQuery";

interface StoredItemJson {
  readonly id: string;
  readonly item_type_id: number;
  readonly count: number;
  readonly attributes: unknown;
  readonly version: number;
  readonly location_type: ItemLocation["kind"];
  readonly character_id: string | null;
  readonly container_id: string | null;
  readonly slot_index: number | null;
  readonly depot_id: number | null;
  readonly seed_key: string | null;
}

interface StoredStateRow {
  readonly items: ReadonlyArray<StoredItemJson>;
  readonly depot_revisions: ReadonlyArray<{
    readonly depot_id: number;
    readonly revision: number;
  }>;
  readonly stash: ReadonlyArray<{
    readonly item_type_id: number;
    readonly count: number;
  }>;
  readonly storage_state: {
    readonly inbox_revision: number;
    readonly stash_revision: number;
  } | null;
}

export class DepotLoadOps {
  constructor(private readonly pool: Pool) {}

  async loadForCharacter(characterId: string): Promise<LoadedDepot> {
    const result = await this.pool.query<StoredStateRow>(storedStateQuery, [
      characterId,
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("stored state query returned no row");
    const items: Item[] = row.items.map((stored) =>
      itemFromRow(storedItemToRow(stored)),
    );
    return {
      characterId,
      items,
      stash: new Map(
        row.stash.map((entry) => [entry.item_type_id, Number(entry.count)]),
      ),
      depotRevisions: new Map(
        row.depot_revisions.map((entry) => [entry.depot_id, entry.revision]),
      ),
      inboxRevision: row.storage_state?.inbox_revision ?? 1,
      stashRevision: row.storage_state?.stash_revision ?? 1,
    };
  }
}

function storedItemToRow(stored: StoredItemJson): DepotItemRow {
  return {
    id: stored.id,
    item_type_id: stored.item_type_id,
    count: stored.count,
    attributes: stored.attributes,
    version: stored.version,
    location_type: stored.location_type,
    character_id: stored.character_id,
    container_id: stored.container_id,
    slot_index: stored.slot_index,
    equipment_slot: null as EquipmentSlot | null,
    world_x: null,
    world_y: null,
    world_z: null,
    world_stack_index: null,
    seed_key: stored.seed_key,
    depot_id: stored.depot_id,
  };
}
