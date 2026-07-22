import { randomUUID } from "node:crypto";
import type { DepotLocation, Position } from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { World } from "../World";
import { monotonicNow } from "../monotonicNow";
import { DepotAccessTracker } from "./DepotAccessTracker";
import type { DepotCache } from "./DepotCache";
import { DepotCacheManager } from "./DepotCacheManager";
import type { DepotCacheEvent } from "./DepotCacheEvent";
import type { DepotIntent } from "./DepotIntent";
import type { DepotMutationPlan } from "./DepotMutationPlan";
import { DepotOperationRunner } from "./DepotOperationRunner";
import { depotPageOf } from "./depotPageOf";
import type { DepotStore, RewardDeliveryRequest } from "./DepotStore";
import { failDepot } from "./failDepot";
import { failMail } from "./failMail";
import type { LoadedDepot } from "./LoadedDepot";
import { planDepotDeposit } from "./planDepotDeposit";
import { planDepotWithdraw } from "./planDepotWithdraw";
import { planStashDeposit } from "./planStashDeposit";
import { planStashWithdraw } from "./planStashWithdraw";
import { projectDepotState } from "./projectDepotState";
import type { StorageAccess } from "./StorageAccess";

const EXPIRY_SCAN_INTERVAL_MS = 60_000;

/**
 * Depot/inbox/stash storage. State for online characters lives in memory
 * (loaded once at login, like carried items) so opening and using the depot
 * answers within the same tick; each mutation's DB write runs behind it in a
 * per-character FIFO. Cross-character flows (mail, rewards, expiry returns)
 * stay commit-first and are injected into online caches after the fact.
 */
export class DepotService {
  private readonly tracker: DepotAccessTracker;
  private readonly caches = new DepotCacheManager();
  private readonly runner: DepotOperationRunner;
  private expirationOperation: Promise<void> | null = null;
  private nextExpiryScanAt = 0;

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly store?: DepotStore,
  ) {
    this.tracker = new DepotAccessTracker(world, items);
    this.runner = new DepotOperationRunner(
      items,
      this.tracker,
      this.caches,
      store,
    );
  }

  async load(characterId: string): Promise<LoadedDepot | null> {
    if (!this.store) return null;
    this.caches.beginLoad(characterId, monotonicNow());
    return this.store.loadForCharacter(characterId);
  }

  attach(loaded: LoadedDepot): void {
    this.caches.attach(loaded);
  }

  detachCharacter(characterId: string): void {
    this.caches.detach(characterId);
    this.items.clearPersistState(characterId);
  }

  handleMapUse(session: Session, position: Position): boolean {
    const mapItems = this.world.getMapItems(position);
    const depotItem = mapItems.find((item) => {
      const depotId = item.source?.attributes.depotId;
      return (
        Number.isInteger(depotId) &&
        Number(depotId) >= 1 &&
        Number(depotId) <= 65_535
      );
    });
    if (depotItem) {
      const depotId = Number(depotItem.source?.attributes.depotId);
      if (!this.tracker.canReach(session, position)) {
        failDepot(session, "out-of-range");
        return true;
      }
      if (!this.store || !session.playerId || !this.caches.get(session.playerId)) {
        failDepot(session, "failed");
        return true;
      }
      const access: StorageAccess = {
        kind: "depot",
        sessionId: randomUUID(),
        position: { ...position },
        depotId,
        townName: this.world.townName(depotId) ?? `Depot ${depotId}`,
      };
      this.tracker.open(session, access);
      this.sendState(session, access, "depot", 1, "");
      return true;
    }
    const mailbox = mapItems.some(
      (item) => this.items.itemType(item.itemId)?.kind === "mailbox",
    );
    if (!mailbox) return false;
    if (!this.tracker.canReach(session, position)) {
      failMail(session, "out-of-range");
      return true;
    }
    if (!this.store) {
      failMail(session, "failed");
      return true;
    }
    const access: StorageAccess = {
      kind: "mailbox",
      sessionId: randomUUID(),
      position: { ...position },
    };
    this.tracker.open(session, access);
    session.send({ type: "mailbox-opened", sessionId: access.sessionId });
    return true;
  }

  handle(session: Session, intent: DepotIntent): void {
    if (intent.type === "close-depot" || intent.type === "close-mailbox") {
      this.tracker.close(session, intent.sessionId);
      return;
    }
    if (intent.type === "send-mail") {
      this.runner.handleSendMail(session, intent);
      return;
    }
    const access = this.tracker.requireDepotAccess(session, intent.sessionId);
    if (!access) return;
    if (intent.type === "depot-browse") {
      this.sendState(session, access, intent.location, intent.page, intent.query);
      return;
    }
    const characterId = session.playerId;
    const carried = characterId
      ? this.items.inventorySnapshot(characterId)
      : null;
    const depot = characterId ? this.caches.get(characterId) : undefined;
    if (!characterId || !carried || !depot || !this.store) {
      failDepot(session, "failed");
      return;
    }
    if (this.items.isPersistPoisoned(characterId)) {
      failDepot(session, "failed");
      return;
    }
    // A carried-item DB op or mail send is mid-flight; memory would race it.
    if (session.itemOperationPending || session.depotOperationPending) {
      failDepot(session, "busy");
      return;
    }
    const planContext = { characterId, catalog: this.catalog, carried, depot };
    if (intent.type === "depot-deposit") {
      this.applyMutation(
        session,
        access,
        "depot",
        planDepotDeposit({
          ...planContext,
          depotId: access.depotId,
          expectedDepotRevision: intent.depotRevision,
          itemId: intent.itemId,
          expectedItemRevision: intent.itemRevision,
        }),
      );
      return;
    }
    if (intent.type === "depot-withdraw") {
      this.applyMutation(
        session,
        access,
        intent.source,
        planDepotWithdraw({
          ...planContext,
          depotId: access.depotId,
          source: intent.source,
          expectedSourceRevision: intent.sourceRevision,
          itemId: intent.itemId,
          expectedItemRevision: intent.itemRevision,
        }),
      );
      return;
    }
    if (intent.type === "stash-deposit") {
      this.applyMutation(
        session,
        access,
        "stash",
        planStashDeposit({
          ...planContext,
          expectedStashRevision: intent.stashRevision,
          itemId: intent.itemId,
          expectedItemRevision: intent.itemRevision,
          count: intent.count,
        }),
      );
      return;
    }
    this.applyMutation(
      session,
      access,
      "stash",
      planStashWithdraw({
        ...planContext,
        expectedStashRevision: intent.stashRevision,
        itemTypeId: intent.itemTypeId,
        count: intent.count,
      }),
    );
  }

  private applyMutation(
    session: Session,
    access: Extract<StorageAccess, { kind: "depot" }>,
    refreshLocation: DepotLocation,
    plan: DepotMutationPlan,
  ): void {
    const characterId = session.playerId;
    if (!characterId) {
      failDepot(session, "failed");
      return;
    }
    if (plan.status !== "ok") {
      failDepot(session, plan.status);
      if (plan.status === "stale") {
        this.sendState(session, access, refreshLocation, 1, "");
      }
      return;
    }
    this.items.applyCommittedMutation(
      session,
      characterId,
      plan.inventoryMutation,
      monotonicNow(),
    );
    this.caches.apply(characterId, plan.cacheEvent);
    this.sendState(session, access, refreshLocation, 1, "");
    this.runner.enqueuePersist(session, characterId, plan.persist);
  }

  private sendState(
    session: Session,
    access: Extract<StorageAccess, { kind: "depot" }>,
    location: DepotLocation,
    page: number,
    query: string,
  ): void {
    const cache = session.playerId
      ? this.caches.get(session.playerId)
      : undefined;
    if (!cache) {
      failDepot(session, "failed");
      return;
    }
    const matchingItemTypeIds =
      query.length === 0
        ? null
        : this.items.itemTypesByName(query).map((type) => type.id);
    const result = depotPageOf(
      cache,
      access.depotId,
      location,
      page,
      matchingItemTypeIds,
    );
    session.send(
      projectDepotState(this.items, access, location, query, page, result),
    );
  }

  cacheFor(characterId: string): DepotCache | undefined {
    return this.caches.get(characterId);
  }

  /** Applies a committed market/system mutation to an online character's cache. */
  applyCacheEvent(characterId: string, event: DepotCacheEvent): void {
    this.caches.apply(characterId, event);
  }

  /** Delivery for a character that may be offline or mid-login. */
  applyExternalCacheEvent(characterId: string, event: DepotCacheEvent): void {
    this.caches.applyExternal(characterId, event);
  }

  applyResolvedOutcomes(): void {
    this.runner.applyResolvedOutcomes();
  }

  tick(now: number): void {
    this.caches.expireLoadBuffers(now);
    if (
      !this.store ||
      this.expirationOperation ||
      now < this.nextExpiryScanAt
    ) {
      return;
    }
    this.nextExpiryScanAt = now + EXPIRY_SCAN_INTERVAL_MS;
    const operation = this.store
      .returnExpired(new Date(now), 25)
      .then((results) => {
        this.runner.pushOutcome(() => {
          for (const result of results) {
            this.caches.applyExternal(result.recipientCharacterId, {
              removedItemIds: result.removedItemIds,
              bumps: [{ kind: "inbox" }],
            });
            this.caches.applyExternal(result.returnCharacterId, {
              upserts: result.items,
              bumps: [{ kind: "inbox" }],
            });
          }
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`inbox expiry scan failed: ${reason}`);
      })
      .finally(() => {
        this.expirationOperation = null;
      });
    this.expirationOperation = operation;
    this.runner.track(operation);
  }

  detach(session: Session): void {
    this.tracker.detach(session);
  }

  deliverReward(request: RewardDeliveryRequest) {
    if (!this.store) throw new Error("depot store is unavailable");
    const operation = this.store.deliverReward(request);
    this.runner.trackRewardInjection(request.recipientCharacterId, operation);
    return operation;
  }

  async stop(): Promise<void> {
    await this.runner.stop();
  }
}
