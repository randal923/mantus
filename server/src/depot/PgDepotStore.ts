import type { DepotLocation } from "@tibia/protocol";
import type { Pool } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import { DepotBrowseReader } from "./DepotBrowseReader";
import { DepotExpiryOps } from "./DepotExpiryOps";
import { DepotMailOps } from "./DepotMailOps";
import { DepotRewardOps } from "./DepotRewardOps";
import { DepotStashOps } from "./DepotStashOps";
import type {
  DepotPage,
  DepotStore,
  DepotTransferResult,
  ExpiredDeliveryResult,
  RewardDeliveryRequest,
  RewardDeliveryResult,
  SendMailRequest,
  SendMailResult,
  StashTransferResult,
} from "./DepotStore";
import { DepotTransferOps } from "./DepotTransferOps";
import { DepotTxHelper } from "./DepotTxHelper";

export class PgDepotStore implements DepotStore {
  private readonly browseReader: DepotBrowseReader;
  private readonly transferOps: DepotTransferOps;
  private readonly stashOps: DepotStashOps;
  private readonly mailOps: DepotMailOps;
  private readonly rewardOps: DepotRewardOps;
  private readonly expiryOps: DepotExpiryOps;

  constructor(pool: Pool, catalog: ItemCatalog) {
    const helper = new DepotTxHelper(catalog);
    this.browseReader = new DepotBrowseReader(pool, helper);
    this.transferOps = new DepotTransferOps(pool, catalog, helper);
    this.stashOps = new DepotStashOps(pool, catalog, helper);
    this.mailOps = new DepotMailOps(pool, catalog, helper);
    this.rewardOps = new DepotRewardOps(pool, catalog, helper);
    this.expiryOps = new DepotExpiryOps(pool, helper);
  }

  browse(
    characterId: string,
    depotId: number,
    location: DepotLocation,
    page: number,
    matchingItemTypeIds: ReadonlyArray<number> | null,
  ): Promise<DepotPage> {
    return this.browseReader.browse(
      characterId,
      depotId,
      location,
      page,
      matchingItemTypeIds,
    );
  }

  deposit(
    characterId: string,
    depotId: number,
    expectedDepotRevision: number,
    itemId: string,
    expectedItemRevision: number,
  ): Promise<DepotTransferResult> {
    return this.transferOps.deposit(
      characterId,
      depotId,
      expectedDepotRevision,
      itemId,
      expectedItemRevision,
    );
  }

  withdraw(
    characterId: string,
    depotId: number,
    source: "depot" | "inbox",
    expectedSourceRevision: number,
    itemId: string,
    expectedItemRevision: number,
    capacityMax: number,
  ): Promise<DepotTransferResult> {
    return this.transferOps.withdraw(
      characterId,
      depotId,
      source,
      expectedSourceRevision,
      itemId,
      expectedItemRevision,
      capacityMax,
    );
  }

  depositStash(
    characterId: string,
    depotId: number,
    expectedStashRevision: number,
    itemId: string,
    expectedItemRevision: number,
    count: number,
  ): Promise<StashTransferResult> {
    return this.stashOps.depositStash(
      characterId,
      depotId,
      expectedStashRevision,
      itemId,
      expectedItemRevision,
      count,
    );
  }

  withdrawStash(
    characterId: string,
    depotId: number,
    expectedStashRevision: number,
    itemTypeId: number,
    count: number,
    capacityMax: number,
  ): Promise<StashTransferResult> {
    return this.stashOps.withdrawStash(
      characterId,
      depotId,
      expectedStashRevision,
      itemTypeId,
      count,
      capacityMax,
    );
  }

  sendMail(request: SendMailRequest): Promise<SendMailResult> {
    return this.mailOps.sendMail(request);
  }

  deliverReward(
    request: RewardDeliveryRequest,
  ): Promise<RewardDeliveryResult> {
    return this.rewardOps.deliverReward(request);
  }

  returnExpired(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<ExpiredDeliveryResult>> {
    return this.expiryOps.returnExpired(now, limit);
  }
}
