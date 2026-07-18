import { randomUUID } from "node:crypto";
import type { Position } from "@tibia/protocol";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { World } from "../World";
import { DepotAccessTracker } from "./DepotAccessTracker";
import type { DepotIntent } from "./DepotIntent";
import { DepotOperationRunner } from "./DepotOperationRunner";
import type { DepotStore, RewardDeliveryRequest } from "./DepotStore";
import { failDepot } from "./failDepot";
import { failMail } from "./failMail";
import type { StorageAccess } from "./StorageAccess";

const EXPIRY_SCAN_INTERVAL_MS = 60_000;

export class DepotService {
  private readonly tracker: DepotAccessTracker;
  private readonly runner: DepotOperationRunner;
  private expirationOperation: Promise<void> | null = null;
  private nextExpiryScanAt = 0;

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly store?: DepotStore,
  ) {
    this.tracker = new DepotAccessTracker(world, items);
    this.runner = new DepotOperationRunner(items, this.tracker, store);
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
      if (!this.store) {
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
      this.runner.beginBrowse(session, access, "depot", 1, "");
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
      this.runner.beginBrowse(
        session,
        access,
        intent.location,
        intent.page,
        intent.query,
      );
      return;
    }
    const snapshot = session.playerId
      ? this.items.inventorySnapshot(session.playerId)
      : null;
    if (!session.playerId || !snapshot || !this.store) {
      failDepot(session, "failed");
      return;
    }
    if (session.itemOperationPending || session.depotOperationPending) {
      failDepot(session, "busy");
      return;
    }
    if (intent.type === "depot-deposit") {
      this.runner.beginDepotMutation(
        session,
        access,
        "depot",
        this.store.deposit(
          session.playerId,
          access.depotId,
          intent.depotRevision,
          intent.itemId,
          intent.itemRevision,
        ),
      );
      return;
    }
    if (intent.type === "depot-withdraw") {
      this.runner.beginDepotMutation(
        session,
        access,
        intent.source,
        this.store.withdraw(
          session.playerId,
          access.depotId,
          intent.source,
          intent.sourceRevision,
          intent.itemId,
          intent.itemRevision,
          snapshot.capacityMax,
        ),
      );
      return;
    }
    if (intent.type === "stash-deposit") {
      this.runner.beginStashMutation(
        session,
        access,
        this.store.depositStash(
          session.playerId,
          access.depotId,
          intent.stashRevision,
          intent.itemId,
          intent.itemRevision,
          intent.count,
        ),
      );
      return;
    }
    this.runner.beginStashMutation(
      session,
      access,
      this.store.withdrawStash(
        session.playerId,
        access.depotId,
        intent.stashRevision,
        intent.itemTypeId,
        intent.count,
        snapshot.capacityMax,
      ),
    );
  }

  applyResolvedOutcomes(): void {
    this.runner.applyResolvedOutcomes();
  }

  tick(now: number): void {
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
      .then(() => undefined)
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
    return this.store.deliverReward(request);
  }

  async stop(): Promise<void> {
    await this.runner.stop();
  }
}
