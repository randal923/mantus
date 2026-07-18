import type {
  BankActionFailedReason,
  BankDepositMessage,
  BankTransferMessage,
  BankWithdrawMessage,
} from "@tibia/protocol";
import { Npc } from "../creature/Npc";
import type { Item } from "../item/Item";
import type { ItemMutation } from "../item/ItemMutation";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import type { BankStore } from "./BankStore";
import { countMoneyWorth } from "./countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  type CurrencyBalance,
} from "./CurrencyBalance";
import { planMoneyGrant } from "./planMoneyGrant";

type BankIntent =
  | BankDepositMessage
  | BankWithdrawMessage
  | BankTransferMessage;

const COIN_STACK_LIMIT = 100;

export class BankService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly store?: BankStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  open(
    session: Session,
    npc: Npc,
    onOpened: () => void,
    onFailed: () => void,
  ): "started" | "unavailable" {
    const store = this.store;
    if (!store) return "unavailable";
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!player || this.world.getCreature(npc.id) !== npc) return "unavailable";
    if (!this.isBanker(npc) || !this.inTalkRange(player, npc)) {
      return "unavailable";
    }
    const operation = store.balance(player.id).then(
      (balance) => {
        this.outcomes.push(() => {
          session.send({
            type: "bank-opened",
            npcId: npc.id,
            npcName: npc.name,
            balance,
          });
          onOpened();
        });
      },
      (cause: unknown) => {
        this.warn(player.id, cause);
        this.outcomes.push(() => onFailed());
      },
    );
    this.track(operation);
    return "started";
  }

  handle(session: Session, intent: BankIntent): void {
    const store = this.store;
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!store || !player) {
      this.fail(session, "failed");
      return;
    }
    const npc = this.world.getCreature(intent.npcId);
    if (
      !(npc instanceof Npc) ||
      !session.knownCreatureIds.has(npc.id) ||
      !this.isBanker(npc) ||
      !this.inTalkRange(player, npc)
    ) {
      this.fail(session, "out-of-range");
      return;
    }
    if (session.itemOperationPending ||
      session.depotPersistsPending > 0 ||
      session.travelOperationPending) {
      this.fail(session, "busy");
      return;
    }
    const precheck = this.precheck(player, intent);
    if (precheck) {
      this.fail(session, precheck);
      return;
    }
    session.itemOperationPending = true;
    const operation = this.commit(store, player, intent).then(
      (result) => {
        this.outcomes.push((at) => {
          session.itemOperationPending = false;
          if (result.status !== "committed") {
            this.fail(session, result.status);
            return;
          }
          if (result.mutation) {
            this.items.applyCommittedMutation(
              session,
              player.id,
              result.mutation,
              at,
            );
          }
          session.send({ type: "bank-updated", balance: result.balance });
        });
      },
      (cause: unknown) => {
        this.warn(player.id, cause);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          this.fail(session, "failed");
        });
      },
    );
    this.track(operation);
    this.items.trackExternalOperation(player.id, operation);
  }

  private async commit(
    store: BankStore,
    player: Player,
    intent: BankIntent,
  ): Promise<
    | { status: "committed"; balance: number; mutation?: ItemMutation }
    | { status: BankActionFailedReason }
  > {
    if (intent.type === "bank-deposit") {
      const result = await store.deposit(player.id, intent.amount);
      return result.status === "committed"
        ? {
            status: "committed",
            balance: result.balance,
            mutation: result.mutation,
          }
        : { status: result.status };
    }
    if (intent.type === "bank-withdraw") {
      const result = await store.withdraw(player.id, intent.amount);
      return result.status === "committed"
        ? {
            status: "committed",
            balance: result.balance,
            mutation: result.mutation,
          }
        : { status: result.status };
    }
    const result = await store.transfer(
      player.id,
      intent.toCharacterName,
      intent.amount,
    );
    return result.status === "committed"
      ? { status: "committed", balance: result.balance }
      : { status: result.status };
  }

  /** Fast in-memory validation at execution time; the store re-checks all of it. */
  private precheck(
    player: Player,
    intent: BankIntent,
  ): BankActionFailedReason | null {
    const snapshot = this.items.inventorySnapshot(player.id);
    if (!snapshot) return "failed";
    if (intent.type === "bank-deposit") {
      const carried = this.countCarried(snapshot.items);
      return countMoneyWorth(carried) < intent.amount
        ? "insufficient-funds"
        : null;
    }
    if (intent.type === "bank-withdraw") {
      const grant = planMoneyGrant(intent.amount);
      const coinCount = grant.gold + grant.platinum + grant.crystal;
      const coinWeight = this.coinWeight();
      const usedWeight = snapshot.items.reduce(
        (total, item) =>
          total + (this.items.itemType(item.typeId)?.weight ?? 0) * item.count,
        0,
      );
      if (usedWeight + coinCount * coinWeight > snapshot.capacityMax * 100) {
        return "no-capacity";
      }
      if (!this.fitsInventory(snapshot.items, grant)) return "no-space";
      return null;
    }
    return null;
  }

  private fitsInventory(
    items: ReadonlyArray<Item>,
    grant: CurrencyBalance,
  ): boolean {
    const backpack = items.find(
      (item) =>
        item.location.kind === "equipment" &&
        item.location.slot === "backpack",
    );
    if (!backpack) return false;
    const capacity = this.items.itemType(backpack.typeId)?.containerCapacity;
    if (capacity === undefined) return false;
    const occupied = items.filter(
      (item) =>
        item.location.kind === "inventory" ||
        (item.location.kind === "container" &&
          item.location.containerId === backpack.id),
    ).length;
    const freeSlots = capacity - occupied;
    if (freeSlots < 0) return false;
    const newStacks = (typeId: number, count: number) => {
      const topUp = items
        .filter((item) => item.typeId === typeId)
        .reduce(
          (total, item) => total + (COIN_STACK_LIMIT - item.count),
          0,
        );
      return Math.ceil(Math.max(0, count - topUp) / COIN_STACK_LIMIT);
    };
    return (
      newStacks(CRYSTAL_COIN_TYPE_ID, grant.crystal) +
        newStacks(PLATINUM_COIN_TYPE_ID, grant.platinum) +
        newStacks(GOLD_COIN_TYPE_ID, grant.gold) <=
      freeSlots
    );
  }

  private countCarried(items: ReadonlyArray<Item>): CurrencyBalance {
    const count = (typeId: number) =>
      items
        .filter((item) => item.typeId === typeId)
        .reduce((total, item) => total + item.count, 0);
    return {
      gold: count(GOLD_COIN_TYPE_ID),
      platinum: count(PLATINUM_COIN_TYPE_ID),
      crystal: count(CRYSTAL_COIN_TYPE_ID),
    };
  }

  private coinWeight(): number {
    return this.items.itemType(GOLD_COIN_TYPE_ID)?.weight ?? 10;
  }

  private isBanker(npc: Npc): boolean {
    return Boolean(
      npc.type.dialogue?.nodes.some((node) => node.action?.kind === "bank"),
    );
  }

  private inTalkRange(player: Player, npc: Npc): boolean {
    const range = npc.type.dialogue?.talkRange ?? 0;
    return (
      player.position.z === npc.position.z &&
      Math.max(
        Math.abs(player.position.x - npc.position.x),
        Math.abs(player.position.y - npc.position.y),
      ) <= range
    );
  }

  private fail(session: Session, reason: BankActionFailedReason): void {
    session.send({ type: "bank-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(characterId: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`bank operation failed for character ${characterId}: ${reason}`);
  }
}
