import {
  DEPOT_LIMITS,
  type HouseListKind,
  type Position,
} from "@tibia/protocol";
import type { Pool, PoolClient } from "pg";
import type { DepotItemRow } from "../depot/DepotItemRow";
import { DepotTxHelper } from "../depot/DepotTxHelper";
import { itemFromRow } from "../depot/itemFromRow";
import { requireItem } from "../depot/requireItem";
import { bumpInboxRevisionUpdate } from "../depot/sql/bumpInboxRevisionUpdate";
import { mailItemToInboxUpdate } from "../depot/sql/mailItemToInboxUpdate";
import { appendBankLedger } from "../economy/appendBankLedger";
import {
  debitGuildBalance,
  recordGuildBankEntry,
} from "../guild/guildBalanceOps";
import { creditBankBalance } from "../economy/creditBankBalance";
import { debitBankBalance } from "../economy/debitBankBalance";
import { lockBankBalance } from "../economy/lockBankBalance";
import { runSerializableTransaction } from "../economy/runSerializableTransaction";
import { TransactionRollback } from "../economy/TransactionRollback";
import { isUniqueViolation } from "../guild/isUniqueViolation";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { marketFreeSlotsQuery } from "../market/sql/marketFreeSlotsQuery";
import type {
  AbandonHouseResult,
  ChargeHouseRentResult,
  CloseHouseAuctionResult,
  HouseAccessRecord,
  HouseAuctionSnapshot,
  HouseEvictionDelivery,
  HouseOpFailure,
  HouseSnapshot,
  HouseStore,
  HouseTextListRecord,
  PlaceHouseBidResult,
  PurchaseHouseResult,
  SetHouseAccessResult,
  SetHouseTextListResult,
  TransferHouseResult,
} from "./HouseStore";
import { deliverHouseLetter } from "./deliverHouseLetter";
import { countHouseAccessQuery } from "./sql/countHouseAccessQuery";
import { countHouseDoorListsQuery } from "./sql/countHouseDoorListsQuery";
import { deleteHouseListQuery } from "./sql/deleteHouseListQuery";
import { deleteHouseListsAllQuery } from "./sql/deleteHouseListsAllQuery";
import { houseListRowsForHouseQuery } from "./sql/houseListRowsForHouseQuery";
import { houseListRowsQuery } from "./sql/houseListRowsQuery";
import { upsertHouseListQuery } from "./sql/upsertHouseListQuery";
import { deleteHouseAuctionQuery } from "./sql/deleteHouseAuctionQuery";
import { dueHouseAuctionIdsQuery } from "./sql/dueHouseAuctionIdsQuery";
import { houseAuctionRowForUpdateQuery } from "./sql/houseAuctionRowForUpdateQuery";
import { houseAuctionRowsQuery } from "./sql/houseAuctionRowsQuery";
import { guildOwnerForUpdateQuery } from "./sql/guildOwnerForUpdateQuery";
import { insertGuildhallQuery } from "./sql/insertGuildhallQuery";
import { houseBidderEligibilityQuery } from "./sql/houseBidderEligibilityQuery";
import { insertHouseAuctionQuery } from "./sql/insertHouseAuctionQuery";
import { updateHouseAuctionBidQuery } from "./sql/updateHouseAuctionBidQuery";
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
  guild_id: string | null;
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

interface ListRow {
  house_id: number;
  kind: number;
  door_x: number;
  door_y: number;
  door_z: number;
  body: string;
}

interface AuctionRow {
  house_id: number;
  bidder_character_id: string;
  bid: string;
  ends_at: Date;
  bidder_name?: string;
}

const ACCESS_GUEST = 0;
const ACCESS_SUBOWNER = 1;

const LIST_KIND_BY_NUMBER: Readonly<Record<number, HouseListKind>> = {
  0: "guest",
  1: "subowner",
  2: "door",
};

const LIST_NUMBER_BY_KIND: Readonly<Record<HouseListKind, number>> = {
  guest: 0,
  subowner: 1,
  door: 2,
};

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
    const [houses, access, lists] = await Promise.all([
      this.pool.query<HouseRow>(houseRowsQuery),
      this.pool.query<AccessRow>(houseAccessRowsQuery),
      this.pool.query<ListRow>(houseListRowsQuery),
    ]);
    const accessByHouse = new Map<number, AccessRow[]>();
    for (const row of access.rows) {
      const rows = accessByHouse.get(row.house_id) ?? [];
      rows.push(row);
      accessByHouse.set(row.house_id, rows);
    }
    const listsByHouse = new Map<number, ListRow[]>();
    for (const row of lists.rows) {
      const rows = listsByHouse.get(row.house_id) ?? [];
      rows.push(row);
      listsByHouse.set(row.house_id, rows);
    }
    return houses.rows.map((row) =>
      this.snapshotFromRows(
        row,
        accessByHouse.get(row.house_id) ?? [],
        listsByHouse.get(row.house_id) ?? [],
      ),
    );
  }

  async loadSnapshot(houseId: number): Promise<HouseSnapshot | null> {
    const house = await this.pool.query<HouseRow>(houseRowQuery, [houseId]);
    const row = house.rows[0];
    if (!row) return null;
    const [access, lists] = await Promise.all([
      this.pool.query<AccessRow>(houseAccessRowsForHouseQuery, [houseId]),
      this.pool.query<ListRow>(houseListRowsForHouseQuery, [houseId]),
    ]);
    return this.snapshotFromRows(row, access.rows, lists.rows);
  }

  async purchase(input: {
    houseId: number;
    characterId: string;
    price: number;
    paidUntilMs: number;
  }): Promise<PurchaseHouseResult> {
    try {
      return await runSerializableTransaction(this.pool, async (client) => {
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

  async purchaseGuildhall(input: {
    houseId: number;
    characterId: string;
    guildId: string;
    price: number;
    paidUntilMs: number;
  }): Promise<PurchaseHouseResult> {
    try {
      return await runSerializableTransaction(this.pool, async (client) => {
        const existing = await client.query<HouseRow>(houseRowForUpdateQuery, [
          input.houseId,
        ]);
        if (existing.rows.length > 0) throw this.rollback("already-owned");
        const guild = await client.query<{
          owner_character_id: string;
          balance: string;
        }>(guildOwnerForUpdateQuery, [input.guildId]);
        const guildRow = guild.rows[0];
        if (!guildRow) throw this.rollback("not-found");
        // Leadership is re-read here, not trusted from the enqueued intent.
        if (guildRow.owner_character_id !== input.characterId) {
          throw this.rollback("not-authorized");
        }
        const balanceAfter =
          input.price > 0
            ? await debitGuildBalance(client, input.guildId, input.price)
            : Number(guildRow.balance);
        // Null means the guarded UPDATE matched nothing: a racing withdrawal
        // took the gold first. Nothing was written.
        if (balanceAfter === null) throw this.rollback("insufficient-funds");
        await client.query(insertGuildhallQuery, [
          input.houseId,
          input.characterId,
          input.guildId,
          new Date(input.paidUntilMs),
        ]);
        if (input.price > 0) {
          await recordGuildBankEntry(client, {
            guildId: input.guildId,
            characterId: input.characterId,
            entryType: "guildhall-purchase",
            auditType: "guild-withdraw",
            amount: input.price,
            balanceAfter,
          });
        }
        await this.audit(client, "house-purchase", input.characterId, {
          houseId: input.houseId,
          price: input.price,
          guildId: input.guildId,
        });
        const snapshot = await this.requireSnapshot(client, input.houseId);
        return { status: "purchased" as const, snapshot };
      });
    } catch (cause) {
      if (isUniqueViolation(cause, "houses_pkey")) {
        return { status: "failed", reason: "already-owned" };
      }
      if (isUniqueViolation(cause, "houses_guild_id_idx")) {
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
    return runSerializableTransaction(this.pool, async (client) => {
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
      return await runSerializableTransaction(this.pool, async (client) => {
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
        // A new tenancy starts with empty lists; the old owner's guests and
        // door lists never carry over.
        await client.query(deleteHouseAccessAllQuery, [input.houseId]);
        await client.query(deleteHouseListsAllQuery, [input.houseId]);
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
    return runSerializableTransaction(this.pool, async (client) => {
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

  async setTextList(input: {
    houseId: number;
    actorCharacterId: string;
    kind: HouseListKind;
    body: string;
    door?: Position;
    maxDoorLists: number;
  }): Promise<SetHouseTextListResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const row = await this.lockHouse(client, input.houseId);
      if (row.owner_character_id !== input.actorCharacterId) {
        // Subowners curate the guest and per-door lists, never the list that
        // decides who is a subowner.
        const access = await client.query<AccessRow>(
          houseAccessRowsForHouseQuery,
          [input.houseId],
        );
        const isSubowner = access.rows.some(
          (entry) =>
            entry.kind === ACCESS_SUBOWNER &&
            entry.character_id === input.actorCharacterId,
        );
        if (!isSubowner || input.kind === "subowner") {
          throw this.rollback("not-authorized");
        }
      }
      const door = input.kind === "door" ? input.door : undefined;
      if (input.kind === "door" && !door) throw this.rollback("not-a-door");
      const key = [
        input.houseId,
        LIST_NUMBER_BY_KIND[input.kind],
        door?.x ?? 0,
        door?.y ?? 0,
        door?.z ?? 0,
      ];
      if (!input.body.trim()) {
        await client.query(deleteHouseListQuery, key);
        return {
          status: "ok" as const,
          snapshot: await this.requireSnapshot(client, input.houseId),
        };
      }
      if (door) {
        const existing = await client.query<{ total: number }>(
          countHouseDoorListsQuery,
          [input.houseId],
        );
        const rows = await client.query<ListRow>(houseListRowsForHouseQuery, [
          input.houseId,
        ]);
        const known = rows.rows.some(
          (entry) =>
            entry.kind === 2 &&
            entry.door_x === door.x &&
            entry.door_y === door.y &&
            entry.door_z === door.z,
        );
        if (!known && (existing.rows[0]?.total ?? 0) >= input.maxDoorLists) {
          throw this.rollback("access-limit");
        }
      }
      await client.query(upsertHouseListQuery, [...key, input.body]);
      return {
        status: "ok" as const,
        snapshot: await this.requireSnapshot(client, input.houseId),
      };
    });
  }

  async loadAuctions(): Promise<ReadonlyArray<HouseAuctionSnapshot>> {
    const result = await this.pool.query<AuctionRow>(houseAuctionRowsQuery);
    return result.rows.map((row) => this.auctionFromRow(row, row.bidder_name));
  }

  async placeBid(input: {
    houseId: number;
    characterId: string;
    amount: number;
    minimumBid: number;
    minIncrement: number;
    endsAtMs: number;
    now: Date;
  }): Promise<PlaceHouseBidResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      // The house row is locked first so a bid racing a direct purchase
      // resolves one way or the other, never both.
      const owned = await client.query<HouseRow>(houseRowForUpdateQuery, [
        input.houseId,
      ]);
      if (owned.rows.length > 0) throw this.rollback("already-owned");
      const standing = await client.query<AuctionRow>(
        houseAuctionRowForUpdateQuery,
        [input.houseId],
      );
      const previous = standing.rows[0];
      if (previous && previous.ends_at.getTime() <= input.now.getTime()) {
        // The close scan owns this auction now; a late bid must not extend it.
        throw this.rollback("auction-closed");
      }
      const floor = previous
        ? Number(previous.bid) + input.minIncrement
        : input.minimumBid;
      if (input.amount < floor) throw this.rollback("bid-too-low");
      if (previous?.bidder_character_id === input.characterId) {
        // Raising your own bid only escrows the difference.
        const delta = input.amount - Number(previous.bid);
        const balance = await lockBankBalance(client, input.characterId);
        if (balance < delta) throw this.rollback("insufficient-funds");
        const after = await debitBankBalance(client, input.characterId, delta);
        await appendBankLedger(
          client,
          input.characterId,
          "house-bid-escrow",
          delta,
          after,
        );
        await client.query(updateHouseAuctionBidQuery, [
          input.houseId,
          input.characterId,
          input.amount,
        ]);
        await this.audit(client, "house-auction-bid", input.characterId, {
          houseId: input.houseId,
          bid: input.amount,
          escrowed: delta,
        });
        return {
          status: "bid" as const,
          auction: await this.requireAuction(client, input.houseId),
          refunded: null,
        };
      }
      // Deadlock-safe fixed order for the two bank rows.
      const parties = previous
        ? [input.characterId, previous.bidder_character_id].sort()
        : [input.characterId];
      const balances = new Map<string, number>();
      for (const characterId of parties) {
        balances.set(characterId, await lockBankBalance(client, characterId));
      }
      if ((balances.get(input.characterId) ?? 0) < input.amount) {
        throw this.rollback("insufficient-funds");
      }
      const after = await debitBankBalance(
        client,
        input.characterId,
        input.amount,
      );
      await appendBankLedger(
        client,
        input.characterId,
        "house-bid-escrow",
        input.amount,
        after,
      );
      let refunded: { characterId: string; amount: number } | null = null;
      if (previous) {
        const refund = Number(previous.bid);
        const refundedAfter = await creditBankBalance(
          client,
          previous.bidder_character_id,
          refund,
        );
        await appendBankLedger(
          client,
          previous.bidder_character_id,
          "house-bid-refund",
          refund,
          refundedAfter,
          input.characterId,
        );
        refunded = {
          characterId: previous.bidder_character_id,
          amount: refund,
        };
        await client.query(updateHouseAuctionBidQuery, [
          input.houseId,
          input.characterId,
          input.amount,
        ]);
      } else {
        await client.query(insertHouseAuctionQuery, [
          input.houseId,
          input.characterId,
          input.amount,
          new Date(input.endsAtMs),
        ]);
      }
      await this.audit(client, "house-auction-bid", input.characterId, {
        houseId: input.houseId,
        bid: input.amount,
        escrowed: input.amount,
        ...(refunded ? { refundedTo: refunded.characterId } : {}),
        ...(refunded ? { refundedAmount: refunded.amount } : {}),
      });
      return {
        status: "bid" as const,
        auction: await this.requireAuction(client, input.houseId),
        refunded,
      };
    });
  }

  async listDueAuctionIds(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<number>> {
    const result = await this.pool.query<{ house_id: number }>(
      dueHouseAuctionIdsQuery,
      [now.toISOString(), limit],
    );
    return result.rows.map((row) => row.house_id);
  }

  async closeAuction(input: {
    houseId: number;
    now: Date;
    paidUntilMs: number;
    buyLevel: number;
  }): Promise<CloseHouseAuctionResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const standing = await client.query<AuctionRow>(
        houseAuctionRowForUpdateQuery,
        [input.houseId],
      );
      const row = standing.rows[0];
      // Row-is-the-lease: a replay after the settling commit finds nothing.
      if (!row || row.ends_at.getTime() > input.now.getTime()) {
        throw new TransactionRollback<CloseHouseAuctionResult>({
          status: "skip",
        });
      }
      const eligibility = await client.query<{
        display_name: string;
        level: number;
        premium_until: Date | null;
        owns_house: boolean;
      }>(houseBidderEligibilityQuery, [row.bidder_character_id]);
      const bidder = eligibility.rows[0];
      const owned = await client.query<HouseRow>(houseRowForUpdateQuery, [
        input.houseId,
      ]);
      const auction = this.auctionFromRow(row, bidder?.display_name);
      const blocked = !bidder
        ? ("own-house-exists" as const)
        : owned.rows.length > 0
          ? ("already-owned" as const)
          : bidder.owns_house
            ? ("own-house-exists" as const)
            : bidder.level < input.buyLevel
              ? ("level-too-low" as const)
              : (bidder.premium_until?.getTime() ?? 0) <= input.now.getTime()
                ? ("premium-required" as const)
                : null;
      if (blocked) {
        const after = await creditBankBalance(
          client,
          row.bidder_character_id,
          auction.bid,
        );
        await appendBankLedger(
          client,
          row.bidder_character_id,
          "house-bid-refund",
          auction.bid,
          after,
        );
        await client.query(deleteHouseAuctionQuery, [input.houseId]);
        await this.audit(
          client,
          "house-auction-settled",
          row.bidder_character_id,
          { houseId: input.houseId, bid: auction.bid, outcome: blocked },
        );
        return { status: "refunded" as const, auction, reason: blocked };
      }
      await client.query(insertHouseQuery, [
        input.houseId,
        row.bidder_character_id,
        new Date(input.paidUntilMs),
      ]);
      await client.query(deleteHouseAuctionQuery, [input.houseId]);
      await this.audit(
        client,
        "house-auction-settled",
        row.bidder_character_id,
        { houseId: input.houseId, bid: auction.bid, outcome: "won" },
      );
      const snapshot = await this.requireSnapshot(client, input.houseId);
      return { status: "sold" as const, snapshot, auction };
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
    warningLetterText: (warningsLeft: number) => string;
  }): Promise<ChargeHouseRentResult> {
    return runSerializableTransaction(this.pool, async (client) => {
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
      // A guildhall's rent comes out of the guild balance, never the
      // leader's personal account.
      const paid = row.guild_id
        ? await this.chargeGuildRent(client, row.guild_id, input.rent, row)
        : await this.chargeOwnerRent(client, row.owner_character_id, input.rent);
      if (paid) {
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
      // Canary mails a stamped letter with every rent warning. The delivery
      // key carries the tenancy and the warning number, so a replayed charge
      // — or a retried transaction — never mails the same warning twice.
      const letter = await deliverHouseLetter(client, this.depot, {
        deliveryKey: `house-rent-letter:${input.houseId}:${row.tenancy_id}:${warnings}`,
        recipientCharacterId: row.owner_character_id,
        text: input.warningLetterText(
          Math.max(input.maxWarnings - warnings, 0),
        ),
      });
      const snapshot = await this.requireSnapshot(client, input.houseId);
      return { status: "warned" as const, snapshot, letter };
    });
  }

  /** Debits one rent period from the owner's bank; false when short. */
  private async chargeOwnerRent(
    client: PoolClient,
    ownerCharacterId: string,
    rent: number,
  ): Promise<boolean> {
    const balance = await lockBankBalance(client, ownerCharacterId);
    if (balance < rent) return false;
    if (rent === 0) return true;
    const after = await debitBankBalance(client, ownerCharacterId, rent);
    await appendBankLedger(client, ownerCharacterId, "house-rent", rent, after);
    return true;
  }

  /** Debits one rent period from the owning guild's balance instead. */
  private async chargeGuildRent(
    client: PoolClient,
    guildId: string,
    rent: number,
    row: HouseRow,
  ): Promise<boolean> {
    if (rent === 0) return true;
    const balanceAfter = await debitGuildBalance(client, guildId, rent);
    if (balanceAfter === null) return false;
    await recordGuildBankEntry(client, {
      guildId,
      characterId: row.owner_character_id,
      entryType: "guildhall-rent",
      auditType: "guild-withdraw",
      amount: rent,
      balanceAfter,
    });
    return true;
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

  private async requireAuction(
    client: PoolClient,
    houseId: number,
  ): Promise<HouseAuctionSnapshot> {
    const result = await client.query<AuctionRow>(houseAuctionRowsQuery);
    const row = result.rows.find((entry) => entry.house_id === houseId);
    if (!row) throw new Error(`auction ${houseId} is missing after mutation`);
    return this.auctionFromRow(row, row.bidder_name);
  }

  private auctionFromRow(
    row: AuctionRow,
    bidderName: string | undefined,
  ): HouseAuctionSnapshot {
    return {
      houseId: row.house_id,
      bidderCharacterId: row.bidder_character_id,
      bidderName: bidderName ?? "?",
      bid: Number(row.bid),
      endsAtMs: row.ends_at.getTime(),
    };
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
    const lists = await client.query<ListRow>(houseListRowsForHouseQuery, [
      houseId,
    ]);
    return this.snapshotFromRows(row, access.rows, lists.rows);
  }

  private snapshotFromRows(
    row: HouseRow,
    access: ReadonlyArray<AccessRow>,
    lists: ReadonlyArray<ListRow>,
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
      guildId: row.guild_id,
      tenancyId: row.tenancy_id,
      paidUntilMs: row.paid_until.getTime(),
      rentWarnings: row.rent_warnings,
      guests: records(ACCESS_GUEST),
      subowners: records(ACCESS_SUBOWNER),
      textLists: lists.flatMap((entry) => {
        const kind = LIST_KIND_BY_NUMBER[entry.kind];
        if (!kind) return [];
        const record: HouseTextListRecord = {
          kind,
          body: entry.body,
          ...(kind === "door"
            ? {
                door: {
                  x: entry.door_x,
                  y: entry.door_y,
                  z: entry.door_z,
                },
              }
            : {}),
        };
        return [record];
      }),
    };
  }

  private async audit(
    client: PoolClient,
    eventType:
      | "house-purchase"
      | "house-transfer"
      | "house-rent"
      | "house-eviction"
      | "house-auction-bid"
      | "house-auction-settled",
    characterId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await client.query(insertHouseAuditQuery, [
      eventType,
      characterId,
      JSON.stringify(details),
    ]);
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
