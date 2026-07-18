import type { Pool } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import { DepotExpiryOps } from "./DepotExpiryOps";
import { DepotLoadOps } from "./DepotLoadOps";
import { DepotMailOps } from "./DepotMailOps";
import type { DepotPersistPlan } from "./DepotPersistPlan";
import { DepotPersistOps } from "./DepotPersistOps";
import { DepotRewardOps } from "./DepotRewardOps";
import type {
  DepotStore,
  ExpiredDeliveryResult,
  RewardDeliveryRequest,
  RewardDeliveryResult,
  SendMailRequest,
  SendMailResult,
} from "./DepotStore";
import { DepotTxHelper } from "./DepotTxHelper";
import type { LoadedDepot } from "./LoadedDepot";

export class PgDepotStore implements DepotStore {
  private readonly loadOps: DepotLoadOps;
  private readonly persistOps: DepotPersistOps;
  private readonly mailOps: DepotMailOps;
  private readonly rewardOps: DepotRewardOps;
  private readonly expiryOps: DepotExpiryOps;

  constructor(pool: Pool, catalog: ItemCatalog) {
    const helper = new DepotTxHelper();
    this.loadOps = new DepotLoadOps(pool);
    this.persistOps = new DepotPersistOps(pool);
    this.mailOps = new DepotMailOps(pool, catalog, helper);
    this.rewardOps = new DepotRewardOps(pool, catalog, helper);
    this.expiryOps = new DepotExpiryOps(pool, helper);
  }

  loadForCharacter(characterId: string): Promise<LoadedDepot> {
    return this.loadOps.loadForCharacter(characterId);
  }

  persist(plan: DepotPersistPlan): Promise<void> {
    return this.persistOps.persist(plan);
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
