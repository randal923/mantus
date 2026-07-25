import type { Pool } from "pg";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { PgCoinOperations } from "../economy/PgCoinOperations";
import type { BackpackSlots } from "../economy/BackpackSlots";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { claimChestLootQuery } from "./sql/claimChestLootQuery";
import { insertChestLootAuditQuery } from "./sql/insertChestLootAuditQuery";
import type {
  ChestLootRequest,
  ChestLootResult,
  ChestStore,
} from "./ChestStore";

const GRANT_REASON = "chest-loot";

/**
 * Durable chest looting: one SERIALIZABLE transaction claims the character's
 * looted gate, grants the reward rows, and writes the economy audit. The gate
 * claim is the first statement, so a replayed use finds it taken and grants
 * nothing (charter rules 2 and 11).
 */
export class PgChestStore implements ChestStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  loot(
    characterId: string,
    request: ChestLootRequest,
  ): Promise<ChestLootResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const claimed = await client.query<{ looted_key: string }>(
        claimChestLootQuery,
        [
          characterId,
          request.lootedKey,
          request.uniqueId,
          request.cooldownSeconds ?? null,
        ],
      );
      if (claimed.rowCount === 0) return { status: "already-looted" as const };
      const coinOps = new PgCoinOperations(client, characterId, this.catalog);
      const owned = await coinOps.loadOwnedItems();
      const backpack = await coinOps.lockBackpackSlots();
      if (!backpack) {
        throw new TransactionRollback<ChestLootResult>({ status: "no-space" });
      }
      const after = new Map<string, Item>();
      const destination = request.container
        ? await this.grantContainer(coinOps, after, backpack, request.container)
        : backpack;
      for (const reward of request.rewards) {
        const granted = reward.stackable
          ? (await coinOps.grantStackable(
              // A fresh reward bag has nothing to top up, and a chest reward
              // must not silently merge into the looter's existing stacks
              // when it is bagged; the flat case may top up.
              request.container ? [] : coinOps.rowsOfType(owned, reward.typeId),
              reward.count,
              reward.typeId,
              reward.maxCount,
              GRANT_REASON,
              after,
              [],
              destination,
            )) === 0
          : await coinOps.grantSingles(
              reward.count,
              reward.typeId,
              GRANT_REASON,
              after,
              destination,
            );
        if (!granted) {
          throw new TransactionRollback<ChestLootResult>({
            status: "no-space",
          });
        }
      }
      await client.query(insertChestLootAuditQuery, [
        characterId,
        request.uniqueId,
        request.lootedKey,
        JSON.stringify(
          request.rewards.map((reward) => ({
            typeId: reward.typeId,
            count: reward.count,
          })),
        ),
        request.container?.typeId ?? null,
      ]);
      return {
        status: "committed" as const,
        mutation: { after: [...after.values()] },
      };
    });
  }

  /**
   * Grants the reward bag itself, then returns a fill order that puts it
   * first so the rewards land inside it (Canary's `player:addItem(container)`
   * followed by `container:addItem(...)`).
   */
  private async grantContainer(
    coinOps: PgCoinOperations,
    after: Map<string, Item>,
    backpack: BackpackSlots,
    container: { typeId: number; capacity: number },
  ): Promise<BackpackSlots> {
    const before = new Set(after.keys());
    if (
      !(await coinOps.grantSingles(
        1,
        container.typeId,
        GRANT_REASON,
        after,
        backpack,
      ))
    ) {
      throw new TransactionRollback<ChestLootResult>({ status: "no-space" });
    }
    const created = [...after.keys()].find((id) => !before.has(id));
    if (created === undefined) {
      throw new Error("chest reward container was not created");
    }
    return {
      containers: [
        {
          containerId: created,
          capacity: container.capacity,
          occupiedSlots: new Set<number>(),
        },
        ...backpack.containers,
      ],
    };
  }
}
