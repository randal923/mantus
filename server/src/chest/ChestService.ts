import type { ChestDefinition } from "../action/ChestDefinition";
import type { WorldActionRng } from "../action/WorldActionRng";
import { carriedWeight } from "../depot/carriedWeight";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { ChestLootRequest, ChestStore } from "./ChestStore";
import type { QuestService } from "../quest/QuestService";

const SECONDS_PER_HOUR = 3_600;

/**
 * Server-authoritative quest chests. The reward list and any random pick are
 * decided here, inside the tick, from the pinned chest table and the server
 * RNG; the durable per-character looted gate is claimed by the store in the
 * same transaction that grants the rows, so a replayed use grants nothing
 * (charter rules 1, 2, 4).
 */
export class ChestService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly rng: WorldActionRng,
    private readonly store?: ChestStore,
    private readonly quests?: QuestService,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  /** Runs inside the tick after the registry validated reach and visibility. */
  loot(session: Session, player: Player, chest: ChestDefinition): void {
    const store = this.store;
    if (
      !store ||
      session.itemOperationPending ||
      session.itemPersistsPending > 0
    ) {
      session.sendError("item-action-failed");
      return;
    }
    const request = this.buildRequest(chest);
    if (!request) {
      session.sendError("item-action-failed");
      return;
    }
    if (!this.hasRoomFor(player, request)) {
      this.say(session, "You have no room to take it.");
      return;
    }
    session.itemOperationPending = true;
    const resolution = store.loot(player.id, request).then(
      (result) => {
        this.outcomes.push((at) => {
          if (result.status === "committed") {
            this.items.applyCommittedMutation(
              session,
              player.id,
              result.mutation,
              at,
            );
          }
          if (session.playerId !== player.id) return;
          session.itemOperationPending = false;
          if (result.status === "committed") {
            // Quest flags land through the platform in the same outcome as
            // the grant (Feature 104); the tx already audited them.
            for (const write of chest.storageWrites ?? []) {
              this.quests?.setStorageValue(player, write.key, write.value);
            }
            this.say(session, this.rewardMessage(request));
            return;
          }
          if (result.status === "already-looted") {
            this.say(session, "It is empty.");
            return;
          }
          this.say(session, "You have no room to take it.");
        });
      },
      (cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(
          `chest ${chest.uniqueId} loot failed for character ${player.id}: ${reason}`,
        );
        this.outcomes.push(() => {
          if (session.playerId !== player.id) return;
          session.itemOperationPending = false;
          session.sendError("item-action-failed");
        });
      },
    );
    this.pendingOperations.add(resolution);
    void resolution.finally(() => this.pendingOperations.delete(resolution));
    this.items.trackExternalOperation(player.id, resolution);
  }

  /**
   * Resolves the chest's reward against the catalog and rolls any random
   * choice. Returns null when a reward type is missing from the pinned
   * catalog, which fails the use closed rather than granting a partial reward.
   */
  private buildRequest(chest: ChestDefinition): ChestLootRequest | null {
    const rolled =
      chest.randomReward && chest.randomReward.length > 0
        ? [this.rng.pick(chest.randomReward)]
        : chest.reward;
    const rewards = [];
    for (const reward of rolled) {
      const type = this.catalog.get(reward.typeId);
      if (!type || !type.pickupable) return null;
      rewards.push({
        typeId: reward.typeId,
        count: reward.count,
        stackable: type.stackable,
        maxCount: Math.max(1, type.maxCount),
      });
    }
    if (rewards.length === 0) return null;
    let container: ChestLootRequest["container"];
    if (chest.containerTypeId !== undefined) {
      const type = this.catalog.get(chest.containerTypeId);
      const capacity = type?.containerCapacity ?? 0;
      if (!type || !type.pickupable || capacity < rewards.length) return null;
      container = { typeId: chest.containerTypeId, capacity };
    }
    return {
      uniqueId: chest.uniqueId,
      lootedKey: chest.lootedKey,
      rewards,
      ...(container === undefined ? {} : { container }),
      ...(chest.storageWrites === undefined
        ? {}
        : { storageWrites: chest.storageWrites }),
      ...(chest.cooldownHours === undefined
        ? {}
        : {
            cooldownSeconds: Math.max(
              1,
              Math.round(chest.cooldownHours * SECONDS_PER_HOUR),
            ),
          }),
    };
  }

  /** Canary's checkWeightAndBackpackRoom, re-read at execution time. */
  private hasRoomFor(player: Player, request: ChestLootRequest): boolean {
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) return false;
    const rewardWeight = request.rewards.reduce(
      (total, reward) =>
        total + (this.catalog.get(reward.typeId)?.weight ?? 0) * reward.count,
      0,
    );
    const containerWeight =
      request.container === undefined
        ? 0
        : (this.catalog.get(request.container.typeId)?.weight ?? 0);
    return (
      carriedWeight(this.catalog, snapshot.items) +
        rewardWeight +
        containerWeight <=
      snapshot.capacityMax * 100
    );
  }

  private rewardMessage(request: ChestLootRequest): string {
    const first = request.container
      ? this.catalog.get(request.container.typeId)?.name
      : this.catalog.get(request.rewards[0]?.typeId ?? 0)?.name;
    return `You have found ${first ?? "something"}.`;
  }

  private say(session: Session, text: string): void {
    session.send({ type: "combat-log", kind: "condition", text });
  }
}
