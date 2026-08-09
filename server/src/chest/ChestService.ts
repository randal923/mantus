import type { ChestDefinition } from "../action/ChestDefinition";
import type { WorldActionRng } from "../action/WorldActionRng";
import { carriedWeight } from "../depot/carriedWeight";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { ChestLootRequest, ChestStore } from "./ChestStore";
import type { QuestService } from "../quest/QuestService";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

const SECONDS_PER_HOUR = 3_600;

/**
 * Server-authoritative quest chests. The reward list and any random pick are
 * decided here, inside the tick, from the pinned chest table and the server
 * RNG; the durable per-character looted gate is claimed by the store in the
 * same transaction that grants the rows, so a replayed use grants nothing
 * (charter rules 1, 2, 4).
 */
export class ChestService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly rng: WorldActionRng,
    private readonly store?: ChestStore,
    private readonly quests?: QuestService,
  ) {}

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
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
      // Canary's checkWeightAndBackpackRoom capacity refusal, announcing the
      // find it could not hand over.
      this.say(
        session,
        `${this.foundPhrase(request)}. Weighing ${this.rewardOunces(
          request,
        )} oz, it is too heavy for you to carry.`,
      );
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
            this.say(session, `${this.foundPhrase(request)}.`);
            return;
          }
          if (result.status === "already-looted") {
            const chestName = this.catalog.get(chest.itemTypeId)?.name;
            this.say(
              session,
              chestName ? `The ${chestName} is empty.` : "It is empty.",
            );
            return;
          }
          this.say(
            session,
            `${this.foundPhrase(request)}, but you have no room to take it.`,
          );
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
      const attributes = {
        ...(reward.actionId === undefined ? {} : { actionId: reward.actionId }),
        ...(reward.text === undefined ? {} : { text: reward.text }),
      };
      rewards.push({
        typeId: reward.typeId,
        count: reward.count,
        stackable: type.stackable,
        maxCount: Math.max(1, type.maxCount),
        ...(Object.keys(attributes).length === 0 ? {} : { attributes }),
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

  /**
   * Canary's find announcement, without the trailing period: the bag for
   * container chests, else the first reward with its count/plural or article
   * ("You have found 23 gold coins" / "You have found a bone key").
   */
  private foundPhrase(request: ChestLootRequest): string {
    if (request.container) {
      const type = this.catalog.get(request.container.typeId);
      const article = type?.article ? `${type.article} ` : "";
      return `You have found ${article}${type?.name ?? "something"}`;
    }
    const first = request.rewards[0];
    const type = first ? this.catalog.get(first.typeId) : undefined;
    if (!first || !type) return "You have found something";
    if (first.stackable && first.count > 1) {
      // Canary's getPluralName defaults to name + "s" when items.xml has none.
      const plural = type.plural ?? `${type.name}s`;
      return `You have found ${first.count} ${plural}`;
    }
    const article = type.article ? `${type.article} ` : "";
    return `You have found ${article}${type.name}`;
  }

  /** Total reward weight in Tibia's display ounces (two decimals). */
  private rewardOunces(request: ChestLootRequest): string {
    const rewardWeight = request.rewards.reduce(
      (total, reward) =>
        total + (this.catalog.get(reward.typeId)?.weight ?? 0) * reward.count,
      0,
    );
    const containerWeight =
      request.container === undefined
        ? 0
        : (this.catalog.get(request.container.typeId)?.weight ?? 0);
    return ((rewardWeight + containerWeight) / 100).toFixed(2);
  }

  private say(session: Session, text: string): void {
    session.send({ type: "combat-log", kind: "condition", text });
  }
}
