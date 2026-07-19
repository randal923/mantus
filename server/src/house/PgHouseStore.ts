import { DEPOT_LIMITS, type Position } from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { DepotItemRow } from "../depot/DepotItemRow";
import { DepotTxHelper } from "../depot/DepotTxHelper";
import { itemFromRow } from "../depot/itemFromRow";
import { requireItem } from "../depot/requireItem";
import { bumpInboxRevisionUpdate } from "../depot/sql/bumpInboxRevisionUpdate";
import { mailItemToInboxUpdate } from "../depot/sql/mailItemToInboxUpdate";
import { appendBankLedger } from "../economy/appendBankLedger";
import { creditBankBalance } from "../economy/creditBankBalance";
import { debitBankBalance } from "../economy/debitBankBalance";
import { lockBankBalance } from "../economy/lockBankBalance";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { isSerializationFailure } from "../guild/isSerializationFailure";
import { isUniqueViolation } from "../guild/isUniqueViolation";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { marketFreeSlotsQuery } from "../market/sql/marketFreeSlotsQuery";
import type {
  AbandonHouseResult,
  ChargeHouseRentResult,
  HouseAccessRecord,
  HouseEvictionDelivery,
  HouseOpFailure,
  HouseSnapshot,
  HouseStore,
  PurchaseHouseResult,
  SetHouseAccessResult,
  TransferHouseResult,
} from "./HouseStore";
import { countHouseAccessQuery } from "./sql/countHouseAccessQuery";
import { deleteHouseAccessAllQuery } from "./sql/deleteHouseAccessAllQuery";
import { deleteHouseAccessQuery } from "./sql/deleteHouseAccessQuery";
import { deleteHouseQuery } from "./sql/deleteHouseQuery";
import { dueHouseIdsQuery } from "./sql/dueHouseIdsQuery";
import { houseAccessRowsForHouseQuery } from "./sql/houseAccessRowsForHouseQuery";
import { houseAccessRowsQuery } from "./sql/houseAccessRowsQuery";
import { houseCharacterByNameQuery } from "./sql/houseCharacterByNameQuery";
import { houseEvictableRowsQuery } from "./sql/houseEvictableRowsQuery";
import { houseRowForUpdateQuery } from "./sql/houseRowForUpdateQuery";
import { houseRowQuery } from "./sql/houseRowQuery";
import { houseRowsQuery } from "./sql/houseRowsQuery";
import { insertHouseAccessQuery } from "./sql/insertHouseAccessQuery";
import { insertHouseAuditQuery } from "./sql/insertHouseAuditQuery";
import { insertHouseEvictionDeliveryQuery } from "./sql/insertHouseEvictionDeliveryQuery";
import { insertHouseQuery } from "./sql/insertHouseQuery";
import { updateHouseOwnerQuery } from "./sql/updateHouseOwnerQuery";
import { updateHouseRentPaidQuery } from "./sql/updateHouseRentPaidQuery";
import { updateHouseRentWarnedQuery } from "./sql/updateHouseRentWarnedQuery";

interface HouseRow {
  house_id: number;
  owner_character_id: string;
  tenancy_id: string;
  paid_until: Date;
  rent_warnings: number;
  owner_name?: string;
}

interface AccessRow {
  house_id: number;
  kind: number;
  character_id: string;
  display_name: string;
}

const ACCESS_GUEST = 0;
const ACCESS_SUBOWNER = 1;

/**
 * Postgres HouseStore. Every mutation is one SERIALIZABLE transaction that
 * locks the house row and re-checks ownership, funds, and access at
 * execution time. Racing buyers resolve on the house_id primary key and the
 * unique owner index; every ownership change moves the movable items inside
 * to the previous owner's inbox in the same transaction under idempotent
 * per-item delivery keys, so a replay can never deliver an item twice.
 */
export class PgHouseStore implements HouseStore {
  private readonly depot = new DepotTxHelper();

  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  async loadAll(): Promise<ReadonlyArray<HouseSnapshot>> {
    const [houses, access] = await Promise.all([
      this.pool.query<HouseRow>(houseRowsQuery),
      this.pool.query<AccessRow>(houseAccessRowsQuery),
    ]);
    const accessByHouse = new Map<number, AccessRow[]>();
    for (const row of access.rows) {
      const rows = accessByHouse.get(row.house_id) ?? [];
      rows.push(row);
      accessByHouse.set(row.house_id, rows);
    }
    return houses.rows.map((row) =>
      this.snapshotFromRows(row, accessByHouse.get(row.house_id) ?? []),
    );
  }

  async loadSnapshot(houseId: number): Promise<HouseSnapshot | null> {
    const house = await this.pool.query<HouseRow>(houseRowQuery, [houseId]);
    const row = house.rows[0];
    if (!row) return null;
    const access = await this.pool.query<AccessRow>(
      houseAccessRowsForHouseQuery,
      [houseId],
    );
    return this.snapshotFromRows(row, access.rows);
  }

  async purchase(input: {
    houseId: number;
    characterId: string;
    price: number;
    paidUntilMs: number;
  }): Promise<PurchaseHouseResult> {
    try {
      return await this.transact(async (client) => {
        const existing = await client.query<HouseRow>(houseRowForUpdateQuery, [
          input.houseId,
        ]);
        if (existing.rows.length > 0) throw this.rollback("already-owned");
        const balance = await lockBankBalance(client, input.characterId);
        if (balance < input.price) throw this.rollback("insufficient-funds");
        await client.query(insertHouseQuery, [
          input.houseId,
          input.characterId,
          new Date(input.paidUntilMs),
        ]);
        if (input.price > 0) {
          const after = await debitBankBalance(
            client,
            input.characterId,
            input.price,
          );
          await appendBankLedger(
            client,
            input.characterId,
            "house-purchase",
            input.price,
            after,
          );
        }
        await this.audit(client, "house-purchase", input.characterId, {
          houseId: input.houseId,
          price: input.price,
        });
        const snapshot = await this.requireSnapshot(client, input.houseId);
        return { status: "purchased" as const, snapshot };
      });
    } catch (cause) {
      if (isUniqueViolation(cause, "houses_pkey")) {
        return { status: "failed", reason: "already-owned" };
      }
      if (isUniqueViolation(cause, "houses_owner_character_id_idx")) {
        return { status: "failed", reason: "own-house-exists" };
      }
      throw cause;
    }
  }

  async abandon(input: {
    houseId: number;
    ownerCharacterId: string;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
  }): Promise<AbandonHouseResult> {
    return this.transact(async (client) => {
      const row = await this.lockHouse(client, input.houseId);
      if (row.owner_character_id !== input.ownerCharacterId) {
        throw this.rollback("not-owner");
      }
      const evicted = await this.evictItems(client, {
        houseId: input.houseId,
        tenancyId: row.tenancy_id,
        recipientCharacterId: row.owner_character_id,
        mapName: input.mapName,
        tilePositions: input.tilePositions,
      });
      const deleted = await client.query(deleteHouseQuery, [
        input.houseId,
        row.tenancy_id,
      ]);
      if (deleted.rowCount !== 1) throw this.rollback("invalid-request");
      await this.audit(client, "house-eviction", row.owner_character_id, {
        houseId: input.houseId,
        reason: "abandon",
        deliveredItems: evicted.deliveredItems.length,
        leftBehind: evicted.leftBehind,
      });
      return { status: "abandoned" as const, evicted };
    });
  }

  async transfer(input: {
    houseId: number;
    fromCharacterId: string;
    toCharacterId: string;
    price: number;
    paidUntilMs: number;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
  }): Promise<TransferHouseResult> {
    try {
      return await this.transact(async (client) => {
        const row = await this.lockHouse(client, input.houseId);
        if (row.owner_character_id !== input.fromCharacterId) {
          throw this.rollback("not-owner");
        }
        // Deadlock-safe fixed order for the two bank rows.
        const balances = new Map<string, number>();
        for (const characterId of [
          input.fromCharacterId,
          input.toCharacterId,
        ].sort()) {
          balances.set(characterId, await lockBankBalance(client, characterId));
        }
        if ((balances.get(input.toCharacterId) ?? 0) < input.price) {
          throw this.rollback("insufficient-funds");
        }
        const evicted = await this.evictItems(client, {
          houseId: input.houseId,
          tenancyId: row.tenancy_id,
          recipientCharacterId: input.fromCharacterId,
          mapName: input.mapName,
          tilePositions: input.tilePositions,
        });
        await client.query(deleteHouseAccessAllQuery, [input.houseId]);
        await client.query(updateHouseOwnerQuery, [
          input.houseId,
          input.toCharacterId,
          new Date(input.paidUntilMs),
        ]);
        if (input.price > 0) {
          const buyerAfter = await debitBankBalance(
            client,
            input.toCharacterId,
            input.price,
          );
          await appendBankLedger(
            client,
            input.toCharacterId,
            "house-transfer-out",
            input.price,
            buyerAfter,
            input.fromCharacterId,
          );
          const sellerAfter = await creditBankBalance(
            client,
            input.fromCharacterId,
            input.price,
          );
          await appendBankLedger(
            client,
            input.fromCharacterId,
            "house-transfer-in",
            input.price,
            sellerAfter,
            input.toCharacterId,
          );
        }
        await this.audit(client, "house-transfer", input.toCharacterId, {
          houseId: input.houseId,
          price: input.price,
          fromCharacterId: input.fromCharacterId,
          toCharacterId: input.toCharacterId,
          deliveredItems: evicted.deliveredItems.length,
          leftBehind: evicted.leftBehind,
        });
        const snapshot = await this.requireSnapshot(client, input.houseId);
        return { status: "transferred" as const, snapshot, evicted };
      });
    } catch (cause) {
      if (isUniqueViolation(cause, "houses_owner_character_id_idx")) {
        return { status: "failed", reason: "target-has-house" };
      }
      throw cause;
    }
  }

  async setAccess(input: {
    houseId: number;
    actorCharacterId: string;
    kind: "guest" | "subowner";
    targetName: string;
    grant: boolean;
    maxEntries: number;
  }): Promise<SetHouseAccessResult> {
    return this.transact(async (client) => {
      const row = await this.lockHouse(client, input.houseId);
      const kind = input.kind === "guest" ? ACCESS_GUEST : ACCESS_SUBOWNER;
      if (row.owner_character_id !== input.actorCharacterId) {
        // Subowners may edit the guest list only.
        const access = await client.query<AccessRow>(
          houseAccessRowsForHouseQuery,
          [input.houseId],
        );
        const isSubowner = access.rows.some(
          (entry) =>
            entry.kind === ACCESS_SUBOWNER &&
            entry.character_id === input.actorCharacterId,
        );
        if (!isSubowner || kind !== ACCESS_GUEST) {
          throw this.rollback("not-authorized");
        }
      }
      const target = await client.query<{ id: string; display_name: string }>(
        houseCharacterByNameQuery,
        [input.targetName],
      );
      const targetRow = target.rows[0];
      if (!targetRow) throw this.rollback("target-not-found");
      if (input.grant) {
        if (targetRow.id === row.owner_character_id) {
          throw this.rollback("invalid-request");
        }
        const count = await client.query<{ total: number }>(
          countHouseAccessQuery,
          [input.houseId],
        );
        if ((count.rows[0]?.total ?? 0) >= input.maxEntries) {
          throw this.rollback("access-limit");
        }
        await client.query(insertHouseAccessQuery, [
          input.houseId,
          kind,
          targetRow.id,
        ]);
      } else {
        await client.query(deleteHouseAccessQuery, [
          input.houseId,
          kind,
          targetRow.id,
        ]);
      }
      const snapshot = await this.requireSnapshot(client, input.houseId);
      return {
        status: "ok" as const,
        entry: { characterId: targetRow.id, name: targetRow.display_name },
        snapshot,
      };
    });
  }

  async listDueHouseIds(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<number>> {
    const result = await this.pool.query<{ house_id: number }>(
      dueHouseIdsQuery,
      [now.toISOString(), limit],
    );
    return result.rows.map((row) => row.house_id);
  }

  async chargeRent(input: {
    houseId: number;
    rent: number;
    now: Date;
    rentPeriodMs: number;
    warningGraceMs: number;
    maxWarnings: number;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
  }): Promise<ChargeHouseRentResult> {
    return this.transact(async (client) => {
      const house = await client.query<HouseRow>(houseRowForUpdateQuery, [
        input.houseId,
      ]);
      const row = house.rows[0];
      // Idempotency guard: replays and restarts observe the advanced
      // paid_until (or the deleted row) and do nothing.
      if (!row || row.paid_until.getTime() > input.now.getTime()) {
        throw new TransactionRollback<ChargeHouseRentResult>({
          status: "skip",
        });
      }
      const balance = await lockBankBalance(client, row.owner_character_id);
      if (balance >= input.rent) {
        if (input.rent > 0) {
          const after = await debitBankBalance(
            client,
            row.owner_character_id,
            input.rent,
          );
          await appendBankLedger(
            client,
            row.owner_character_id,
            "house-rent",
            input.rent,
            after,
          );
        }
        const paidUntil = row.paid_until.getTime() + input.rentPeriodMs;
        await client.query(updateHouseRentPaidQuery, [
          input.houseId,
          new Date(paidUntil),
          input.now.toISOString(),
        ]);
        await this.audit(client, "house-rent", row.owner_character_id, {
          houseId: input.houseId,
          rent: input.rent,
          paidUntil,
        });
        const snapshot = await this.requireSnapshot(client, input.houseId);
        return { status: "paid" as const, snapshot };
      }
      const warnings = row.rent_warnings + 1;
      if (warnings >= input.maxWarnings) {
        const evicted = await this.evictItems(client, {
          houseId: input.houseId,
          tenancyId: row.tenancy_id,
          recipientCharacterId: row.owner_character_id,
          mapName: input.mapName,
          tilePositions: input.tilePositions,
        });
        const deleted = await client.query(deleteHouseQuery, [
          input.houseId,
          row.tenancy_id,
        ]);
        if (deleted.rowCount !== 1) throw this.rollback("invalid-request");
        await this.audit(client, "house-eviction", row.owner_character_id, {
          houseId: input.houseId,
          reason: "rent",
          deliveredItems: evicted.deliveredItems.length,
          leftBehind: evicted.leftBehind,
        });
        return {
          status: "evicted" as const,
          ownerCharacterId: row.owner_character_id,
          evicted,
        };
      }
      await client.query(updateHouseRentWarnedQuery, [
        input.houseId,
        new Date(input.now.getTime() + input.warningGraceMs),
        warnings,
      ]);
      const snapshot = await this.requireSnapshot(client, input.houseId);
      return { status: "warned" as const, snapshot };
    });
  }

  /**
   * Moves the movable world-item roots on the house tiles into the
   * recipient's inbox. Each move is guarded by an idempotent per-item
   * delivery key; rows whose key already exists are skipped, so a crash and
   * retry of the surrounding operation delivers every item exactly once.
   * Items that do not fit the inbox stay on the tiles.
   */
  private async evictItems(
    client: PoolClient,
    input: {
      houseId: number;
      tenancyId: string;
      recipientCharacterId: string;
      mapName: string;
      tilePositions: ReadonlyArray<Position>;
    },
  ): Promise<HouseEvictionDelivery> {
    const none: HouseEvictionDelivery = {
      recipientCharacterId: input.recipientCharacterId,
      deliveredItems: [],
      removedItemIds: [],
      leftBehind: 0,
    };
    if (input.tilePositions.length === 0) return none;
    const rows = await client.query<DepotItemRow>(houseEvictableRowsQuery, [
      input.mapName,
      input.tilePositions.map((position) => position.x),
      input.tilePositions.map((position) => position.y),
      input.tilePositions.map((position) => position.z),
    ]);
    const movable = rows.rows.filter((row) => {
      const type = this.catalog.get(row.item_type_id);
      return Boolean(type?.pickupable && type.movable);
    });
    if (movable.length === 0) return none;
    await this.depot.ensureStorageState(client, input.recipientCharacterId);
    const slots = await client.query<{ slot: number }>(marketFreeSlotsQuery, [
      input.recipientCharacterId,
      "inbox",
      DEPOT_LIMITS.maxInboxItems,
      movable.length,
    ]);
    const delivered: Item[] = [];
    const removedItemIds: string[] = [];
    let slotIndex = 0;
    let leftBehind = 0;
    for (const row of movable) {
      const slot = slots.rows[slotIndex]?.slot;
      if (slot === undefined) {
        leftBehind += 1;
        continue;
      }
      const claimed = await client.query(insertHouseEvictionDeliveryQuery, [
        `house-evict:${input.houseId}:${input.tenancyId}:${row.id}`,
        input.recipientCharacterId,
        row.id,
      ]);
      // Zero rows inserted: this item was already delivered for this tenancy.
      if (claimed.rowCount !== 1) continue;
      slotIndex += 1;
      const before = itemFromRow(row);
      const moved = await client.query<DepotItemRow>(mailItemToInboxUpdate, [
        row.id,
        input.recipientCharacterId,
        slot,
      ]);
      const after = requireItem(moved.rows[0]);
      delivered.push(after);
      removedItemIds.push(row.id);
      await this.depot.auditTransfer(
        client,
        input.recipientCharacterId,
        before,
        after,
        "house-eviction",
      );
    }
    if (delivered.length > 0) {
      await client.query(bumpInboxRevisionUpdate, [
        input.recipientCharacterId,
      ]);
    }
    return {
      recipientCharacterId: input.recipientCharacterId,
      deliveredItems: delivered,
      removedItemIds,
      leftBehind,
    };
  }

  private async lockHouse(
    client: PoolClient,
    houseId: number,
  ): Promise<HouseRow> {
    const result = await client.query<HouseRow>(houseRowForUpdateQuery, [
      houseId,
    ]);
    const row = result.rows[0];
    if (!row) throw this.rollback("not-found");
    return row;
  }

  private async requireSnapshot(
    client: PoolClient,
    houseId: number,
  ): Promise<HouseSnapshot> {
    const house = await client.query<HouseRow>(houseRowQuery, [houseId]);
    const row = house.rows[0];
    if (!row) throw new Error(`house ${houseId} is missing after mutation`);
    const access = await client.query<AccessRow>(houseAccessRowsForHouseQuery, [
      houseId,
    ]);
    return this.snapshotFromRows(row, access.rows);
  }

  private snapshotFromRows(
    row: HouseRow,
    access: ReadonlyArray<AccessRow>,
  ): HouseSnapshot {
    const records = (kind: number): HouseAccessRecord[] =>
      access
        .filter((entry) => entry.kind === kind)
        .map((entry) => ({
          characterId: entry.character_id,
          name: entry.display_name,
        }));
    return {
      houseId: row.house_id,
      ownerCharacterId: row.owner_character_id,
      ownerName: row.owner_name ?? "?",
      tenancyId: row.tenancy_id,
      paidUntilMs: row.paid_until.getTime(),
      rentWarnings: row.rent_warnings,
      guests: records(ACCESS_GUEST),
      subowners: records(ACCESS_SUBOWNER),
    };
  }

  private async audit(
    client: PoolClient,
    eventType:
      | "house-purchase"
      | "house-transfer"
      | "house-rent"
      | "house-eviction",
    characterId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(insertHouseAuditQuery, [
      eventType,
      characterId,
      JSON.stringify(details),
    ]);
  }

  private async transact<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let lastCause: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await runSerializableTransaction(this.pool, operation);
      } catch (cause) {
        if (!isSerializationFailure(cause)) throw cause;
        lastCause = cause;
      }
    }
    throw lastCause;
  }

  private rollback(
    reason: HouseOpFailure["reason"],
  ): TransactionRollback<HouseOpFailure> {
    return new TransactionRollback<HouseOpFailure>({
      status: "failed",
      reason,
    });
  }
}
