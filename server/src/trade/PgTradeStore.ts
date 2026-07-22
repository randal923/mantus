import type { Pool, PoolClient } from "pg";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { itemFromRow } from "../item/itemFromRow";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { itemLocationColumns } from "../item/itemLocationColumns";
import type { ItemRow } from "../item/ItemRow";
import { insertItemTransferredAudit } from "../item/sql/insertItemTransferredAudit";
import { itemContentsQuery } from "../item/sql/itemContentsQuery";
import { lockCharacterQuery } from "../item/sql/lockCharacterQuery";
import { lockItemsQuery } from "../item/sql/lockItemsQuery";
import { ownedItemsQuery } from "../item/sql/ownedItemsQuery";
import { persistCarriedWriteUpdate } from "../item/sql/persistCarriedWriteUpdate";
import { planTradeDelivery } from "./planTradeDelivery";
import { tradeReservationsQuery } from "./sql/tradeReservationsQuery";
import type {
  TradeCommitInput,
  TradeCommitLeg,
  TradeCommitResult,
  TradeStore,
} from "./TradeStore";

/**
 * Postgres TradeStore. The commit is one SERIALIZABLE transaction: both
 * character rows lock in id order, both reserved roots lock and re-verify
 * (location, version) against DB truth, each receiver's capacity and room
 * re-check from freshly read carried rows, then both roots move and both
 * audit entries append — commit or nothing (charter rules 2, 4, 11).
 */
export class PgTradeStore implements TradeStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async loadReservations(characterId: string): Promise<ReadonlyArray<Item>> {
    const result = await this.pool.query<ItemRow>(tradeReservationsQuery, [
      characterId,
    ]);
    return result.rows.map(itemFromRow);
  }

  async commitTrade(input: TradeCommitInput): Promise<TradeCommitResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const characterIds = [
        input.legs[0].giverCharacterId,
        input.legs[1].giverCharacterId,
      ].sort();
      for (const characterId of characterIds) {
        await client.query(lockCharacterQuery, [characterId]);
      }
      const roots = [input.legs[0].items[0], input.legs[1].items[0]];
      if (!roots[0] || !roots[1]) {
        throw new TransactionRollback<TradeCommitResult>({ status: "failed" });
      }
      const locked = await client.query<ItemRow>(lockItemsQuery, [
        [roots[0].id, roots[1].id],
      ]);
      const lockedById = new Map(
        locked.rows.map((row) => [row.id, itemFromRow(row)]),
      );
      const first = await this.deliverLeg(
        client,
        input.tradeId,
        input.legs[0],
        lockedById,
      );
      const second = await this.deliverLeg(
        client,
        input.tradeId,
        input.legs[1],
        lockedById,
      );
      return { status: "committed", delivered: [first, second] };
    });
  }

  private async deliverLeg(
    client: PoolClient,
    tradeId: string,
    leg: TradeCommitLeg,
    lockedById: ReadonlyMap<string, Item>,
  ): Promise<ReadonlyArray<Item>> {
    const snapshotRoot = leg.items[0];
    const root = snapshotRoot ? lockedById.get(snapshotRoot.id) : undefined;
    if (
      !snapshotRoot ||
      !root ||
      root.version !== snapshotRoot.version ||
      root.location.kind !== "trade-reservation" ||
      root.location.characterId !== leg.giverCharacterId
    ) {
      throw new TransactionRollback<TradeCommitResult>({ status: "failed" });
    }
    const subtree = await client.query<ItemRow>(itemContentsQuery, [root.id]);
    const legItems = [
      root,
      ...subtree.rows.map(itemFromRow).filter((item) => item.id !== root.id),
    ];
    const carried = await client.query<ItemRow>(ownedItemsQuery, [
      leg.receiverCharacterId,
    ]);
    const planned = planTradeDelivery({
      catalog: this.catalog,
      receiverItems: carried.rows.map(itemFromRow),
      receiverCapacityMax: leg.receiverCapacityMax,
      legItems,
    });
    if (planned.status !== "ok") {
      throw new TransactionRollback<TradeCommitResult>({
        status: planned.status,
        failedCharacterId: leg.receiverCharacterId,
      });
    }
    const moved = planned.delivered[0];
    if (!moved) {
      throw new TransactionRollback<TradeCommitResult>({ status: "failed" });
    }
    const columns = itemLocationColumns(moved);
    const updated = await client.query(persistCarriedWriteUpdate, [
      moved.id,
      moved.typeId,
      moved.count,
      JSON.stringify(moved.attributes),
      moved.version,
      columns.locationType,
      columns.characterId,
      columns.containerId,
      columns.slotIndex,
      columns.equipmentSlot,
      columns.worldMapName,
      columns.worldX,
      columns.worldY,
      columns.worldZ,
      columns.worldStackIndex,
      root.version,
    ]);
    if (updated.rowCount !== 1) {
      throw new TransactionRollback<TradeCommitResult>({ status: "failed" });
    }
    await client.query(insertItemTransferredAudit, [
      leg.giverCharacterId,
      moved.id,
      JSON.stringify({
        from: root.location,
        to: moved.location,
        count: moved.count,
        trade: {
          tradeId,
          fromCharacterId: leg.giverCharacterId,
          toCharacterId: leg.receiverCharacterId,
        },
      }),
    ]);
    return planned.delivered;
  }
}
