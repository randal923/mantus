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
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { BankStore } from "./BankStore";
import { COIN_STACK_LIMIT } from "./coinStackLimit";
import { countCarriedCoins } from "./countCarriedCoins";
import { countFreeBackpackSlots } from "./countFreeBackpackSlots";
import { countMoneyWorth } from "./countMoneyWorth";
import {
  CRYSTAL_COIN_TYPE_ID,
  GOLD_COIN_TYPE_ID,
  PLATINUM_COIN_TYPE_ID,
  type CurrencyBalance,
} from "./CurrencyBalance";
import { inNpcTalkRange } from "./inNpcTalkRange";
import { planMoneyGrant } from "./planMoneyGrant";

type BankIntent =
  | BankDepositMessage
  | BankWithdrawMessage
  | BankTransferMessage;

export class BankService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly store?: BankStore,
    private readonly registry?: SessionRegistry,
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
    if (!this.isBanker(npc) || !inNpcTalkRange(player, npc)) {
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
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    const npc = this.world.getCreature(intent.npcId);
    if (!player || !(npc instanceof Npc)) {
      this.fail(session, player ? "out-of-range" : "failed");
      return;
    }
    this.run(
      session,
      player,
      npc,
      intent,
      (balance) => session.send({ type: "bank-updated", balance }),
      (reason) => this.fail(session, reason),
    );
  }

  /**
   * Canary's free-text money keywords. The amount was typed by the player, so
   * it runs the identical validation, precheck and store path the panel uses;
   * only the reply surface differs.
   */
  handleKeyword(
    session: Session,
    npc: Npc,
    operation: "deposit" | "withdraw",
    amount: number,
    onCommitted: (balance: number) => void,
    onFailed: (reason: BankActionFailedReason) => void,
  ): "started" | "unavailable" {
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!player) return "unavailable";
    const intent: BankIntent =
      operation === "deposit"
        ? { type: "bank-deposit", npcId: npc.id, amount }
        : { type: "bank-withdraw", npcId: npc.id, amount };
    return this.run(session, player, npc, intent, onCommitted, onFailed);
  }

  private run(
    session: Session,
    player: Player,
    npc: Npc,
    intent: BankIntent,
    onCommitted: (balance: number) => void,
    onFailed: (reason: BankActionFailedReason) => void,
  ): "started" | "unavailable" {
    const store = this.store;
    if (!store) {
      onFailed("failed");
      return "unavailable";
    }
    if (
      !session.knownCreatureIds.has(npc.id) ||
      !this.isBanker(npc) ||
      !inNpcTalkRange(player, npc)
    ) {
      onFailed("out-of-range");
      return "unavailable";
    }
    if (session.itemOperationPending ||
      session.itemPersistsPending > 0 ||
      session.travelOperationPending) {
      onFailed("busy");
      return "unavailable";
    }
    const precheck = this.precheck(player, intent);
    if (precheck) {
      onFailed(precheck);
      return "unavailable";
    }
    session.itemOperationPending = true;
    const operation = this.commit(store, player, intent).then(
      (result) => {
        this.outcomes.push((at) => {
          session.itemOperationPending = false;
          if (result.status !== "committed") {
            onFailed(result.status);
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
          onCommitted(result.balance);
          if (result.recipient) {
            this.notifyRecipient(
              result.recipient.characterId,
              result.recipient.balance,
            );
          }
        });
      },
      (cause: unknown) => {
        this.warn(player.id, cause);
        this.outcomes.push(() => {
          session.itemOperationPending = false;
          onFailed("failed");
        });
      },
    );
    this.track(operation);
    this.items.trackExternalOperation(player.id, operation);
    return "started";
  }

  /**
   * Pushes the recipient's own new balance to their live session. Nothing
   * about the sender travels with it beyond what the transfer itself already
   * reveals — the recipient sees a balance, not who moved it (charter rule 6).
   */
  private notifyRecipient(toCharacterId: string, balance: number): void {
    this.registry?.sessionFor(toCharacterId)?.send({
      type: "bank-updated",
      balance,
    });
  }

  private async commit(
    store: BankStore,
    player: Player,
    intent: BankIntent,
  ): Promise<
    | {
        status: "committed";
        balance: number;
        mutation?: ItemMutation;
        recipient?: { characterId: string; balance: number };
      }
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
      ? {
          status: "committed",
          balance: result.balance,
          recipient: {
            characterId: result.toCharacterId,
            balance: result.toBalance,
          },
        }
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
      const carried = countCarriedCoins(snapshot.items);
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
    const freeSlots = countFreeBackpackSlots(
      items,
      (typeId) => this.items.itemType(typeId)?.containerCapacity,
    );
    if (freeSlots <= 0) return false;
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

  private coinWeight(): number {
    return this.items.itemType(GOLD_COIN_TYPE_ID)?.weight ?? 10;
  }

  private isBanker(npc: Npc): boolean {
    return Boolean(
      npc.type.dialogue?.nodes.some((node) => node.action?.kind === "bank"),
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
