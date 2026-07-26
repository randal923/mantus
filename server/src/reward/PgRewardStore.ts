import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { REWARD_LIMITS, type RewardBag } from "@tibia/protocol";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import type { BackpackSlots } from "../economy/BackpackSlots";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemRow } from "../item/ItemRow";
import { itemFromRow } from "../item/itemFromRow";
import { lockCharacterQuery } from "../item/sql/lockCharacterQuery";
import { claimRewardGrantQuery } from "./sql/claimRewardGrantQuery";
import { collectRewardItemUpdate } from "./sql/collectRewardItemUpdate";
import { deleteRewardBagsQuery } from "./sql/deleteRewardBagsQuery";
import { deleteRewardChildrenQuery } from "./sql/deleteRewardChildrenQuery";
import { insertRewardAuditQuery } from "./sql/insertRewardAuditQuery";
import { insertRewardBagQuery } from "./sql/insertRewardBagQuery";
import { insertRewardChildQuery } from "./sql/insertRewardChildQuery";
import { rewardBagChildrenQuery } from "./sql/rewardBagChildrenQuery";
import { rewardBagsQuery } from "./sql/rewardBagsQuery";
import { rewardSlotIndexesQuery } from "./sql/rewardSlotIndexesQuery";
import { setRewardGrantBagUpdate } from "./sql/setRewardGrantBagUpdate";
import type {
  RewardChestSnapshot,
  RewardCollectResult,
  RewardGrantRequest,
  RewardGrantResult,
  RewardStore,
} from "./RewardStore";

/** Canary ITEM_REWARD_CONTAINER (utils_definitions.hpp:609). */
const REWARD_BAG_TYPE_ID = 19_202;
const MAX_REWARD_SLOTS = 2_000;

interface RewardBagAttributes {
  readonly createdAtMs: number;
  readonly boss: string;
}

/**
 * Durable boss reward chests on the item-ownership model: a bag is one
 * character-owned 'reward' row, its contents ordinary 'container' rows.
 * Grants claim `reward_grants` first (exactly-once); collects move the same
 * rows into carried slots inside one SERIALIZABLE transaction with the
 * character row locked, so a double-collect race leaves exactly one item
 * (charter rules 2, 11).
 */
export class PgRewardStore implements RewardStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  grantBossRewards(request: RewardGrantRequest): Promise<RewardGrantResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const claimed = await client.query(claimRewardGrantQuery, [
        request.grantKey,
        request.recipientCharacterId,
      ]);
      if (claimed.rowCount === 0) return { status: "duplicate" as const };
      if (request.items.length === 0) {
        return { status: "granted" as const, bagItemId: null };
      }
      await client.query(lockCharacterQuery, [request.recipientCharacterId]);
      const slots = await client.query<{ slot_index: number }>(
        rewardSlotIndexesQuery,
        [request.recipientCharacterId],
      );
      const used = new Set(slots.rows.map((row) => row.slot_index));
      const slot = Array.from({ length: MAX_REWARD_SLOTS }, (_, index) => index)
        .find((index) => !used.has(index));
      if (slot === undefined) {
        throw new TransactionRollback<RewardGrantResult>({
          status: "chest-full",
        });
      }
      const bagItemId = randomUUID();
      const attributes: { reward: RewardBagAttributes } = {
        reward: { createdAtMs: request.createdAtMs, boss: request.bossName },
      };
      await client.query(insertRewardBagQuery, [
        bagItemId,
        REWARD_BAG_TYPE_ID,
        JSON.stringify(attributes),
        request.recipientCharacterId,
        slot,
      ]);
      const items = request.items.slice(0, REWARD_LIMITS.maxItemsPerBag);
      for (const [index, item] of items.entries()) {
        await client.query(insertRewardChildQuery, [
          randomUUID(),
          item.typeId,
          item.count,
          bagItemId,
          index,
        ]);
      }
      await client.query(setRewardGrantBagUpdate, [
        request.grantKey,
        bagItemId,
      ]);
      await client.query(insertRewardAuditQuery, [
        "boss-reward",
        request.recipientCharacterId,
        JSON.stringify({
          grantKey: request.grantKey,
          boss: request.bossName,
          items: items.map((item) => ({
            typeId: item.typeId,
            count: item.count,
          })),
        }),
      ]);
      return { status: "granted" as const, bagItemId };
    });
  }

  loadRewardChest(
    characterId: string,
    nowMs: number,
  ): Promise<RewardChestSnapshot> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(lockCharacterQuery, [characterId]);
      return this.loadChestLocked(client, characterId, nowMs);
    });
  }

  collect(
    characterId: string,
    bagItemId: string,
    itemId: string | null,
    nowMs: number,
  ): Promise<RewardCollectResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(lockCharacterQuery, [characterId]);
      const bags = await client.query<ItemRow>(rewardBagsQuery, [characterId]);
      const bag = bags.rows.find((row) => row.id === bagItemId);
      if (!bag || this.isExpired(bag, nowMs)) {
        return { status: "not-found" as const };
      }
      const children = await client.query<ItemRow>(rewardBagChildrenQuery, [
        [bagItemId],
      ]);
      const targets = itemId
        ? children.rows.filter((row) => row.id === itemId)
        : children.rows;
      if (targets.length === 0) return { status: "not-found" as const };
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const backpack = await coinOps.lockBackpackSlots();
      if (!backpack) {
        throw new TransactionRollback<RewardCollectResult>({
          status: "no-space",
        });
      }
      const moved: Item[] = [];
      for (const row of targets) {
        const destination = this.takeFreeSlot(backpack);
        if (!destination) {
          throw new TransactionRollback<RewardCollectResult>({
            status: "no-space",
          });
        }
        const updated = await client.query<ItemRow>(collectRewardItemUpdate, [
          row.id,
          destination.containerId,
          destination.slot,
          row.version,
        ]);
        const movedRow = updated.rows[0];
        if (!movedRow) {
          throw new Error(`reward item ${row.id} vanished mid-collect`);
        }
        moved.push(itemFromRow(movedRow));
      }
      if (targets.length === children.rows.length) {
        await client.query(deleteRewardBagsQuery, [[bagItemId]]);
      }
      await client.query(insertRewardAuditQuery, [
        "reward-collect",
        characterId,
        JSON.stringify({
          bagId: bagItemId,
          items: moved.map((item) => ({
            itemId: item.id,
            typeId: item.typeId,
            count: item.count,
          })),
        }),
      ]);
      const state = await this.loadChestLocked(client, characterId, nowMs);
      return {
        status: "committed" as const,
        mutation: { after: moved },
        state,
      };
    });
  }

  /** Deletes expired bags, audits the drop, and snapshots the remainder. */
  private async loadChestLocked(
    client: PoolClient,
    characterId: string,
    nowMs: number,
  ): Promise<RewardChestSnapshot> {
    const bags = await client.query<ItemRow>(rewardBagsQuery, [characterId]);
    const expired = bags.rows.filter((row) => this.isExpired(row, nowMs));
    if (expired.length > 0) {
      const expiredIds = expired.map((row) => row.id);
      await client.query(deleteRewardChildrenQuery, [expiredIds]);
      await client.query(deleteRewardBagsQuery, [expiredIds]);
      await client.query(insertRewardAuditQuery, [
        "reward-expired",
        characterId,
        JSON.stringify({ bags: expiredIds }),
      ]);
    }
    const remaining = bags.rows.filter((row) => !this.isExpired(row, nowMs));
    if (remaining.length === 0) return { bags: [] };
    const children = await client.query<ItemRow>(rewardBagChildrenQuery, [
      remaining.map((row) => row.id),
    ]);
    const byBag = new Map<string, ItemRow[]>();
    for (const row of children.rows) {
      if (!row.container_id) continue;
      const list = byBag.get(row.container_id) ?? [];
      list.push(row);
      byBag.set(row.container_id, list);
    }
    const snapshot: RewardBag[] = remaining.map((row) => {
      const reward = this.bagAttributes(row);
      return {
        bagId: row.id,
        createdAtMs: reward.createdAtMs,
        expiresAtMs: reward.createdAtMs + REWARD_LIMITS.expiryMs,
        bossName: reward.boss,
        items: (byBag.get(row.id) ?? []).map((child) => {
          const type = this.catalog.get(child.item_type_id);
          return {
            itemId: child.id,
            itemTypeId: child.item_type_id,
            count: child.count,
            name: type?.name ?? `item ${child.item_type_id}`,
            spriteId: type?.spriteId ?? 0,
          };
        }),
      };
    });
    return { bags: snapshot };
  }

  private bagAttributes(row: ItemRow): RewardBagAttributes {
    const raw = (row.attributes as Record<string, unknown> | null)?.reward;
    const bag = raw as Partial<RewardBagAttributes> | undefined;
    return {
      createdAtMs:
        typeof bag?.createdAtMs === "number" && bag.createdAtMs >= 0
          ? bag.createdAtMs
          : 0,
      boss:
        typeof bag?.boss === "string" && bag.boss.length > 0
          ? bag.boss.slice(0, 100)
          : "unknown boss",
    };
  }

  private isExpired(row: ItemRow, nowMs: number): boolean {
    return (
      this.bagAttributes(row).createdAtMs + REWARD_LIMITS.expiryMs <= nowMs
    );
  }

  /** First free slot across the locked fill order; marks it occupied. */
  private takeFreeSlot(
    backpack: BackpackSlots,
  ): { containerId: string; slot: number } | null {
    for (const container of backpack.containers) {
      for (let slot = 0; slot < container.capacity; slot++) {
        if (container.occupiedSlots.has(slot)) continue;
        container.occupiedSlots.add(slot);
        return { containerId: container.containerId, slot };
      }
    }
    return null;
  }
}
