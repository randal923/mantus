import type {
  BankActionFailedReason,
  BankDepositMessage,
  BankTransferMessage,
  BankWithdrawMessage,
} from "@tibia/protocol";
import { Npc } from "../creature/Npc";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemMutation } from "../item/ItemMutation";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { BankStore } from "./BankStore";
import type { EconomyPersistPlan } from "./EconomyPersistPlan";
import type { EconomyPersistStore } from "./EconomyPersistStore";
import { inNpcTalkRange } from "./inNpcTalkRange";
import { planBankDeposit } from "./plan/planBankDeposit";
import { planBankWithdraw } from "./plan/planBankWithdraw";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

type BankIntent =
  | BankDepositMessage
  | BankWithdrawMessage
  | BankTransferMessage;

/**
 * Banking against the balance cached with the character's items.
 *
 * Deposits and withdrawals are memory-first: they touch one character, so they
 * are planned and applied inside the tick and flushed behind it, exactly like a
 * shop purchase.
 *
 * A transfer stays database-first on purpose. It moves money to a character who
 * may be offline and is named rather than identified, so the recipient's row can
 * only be found and credited in a transaction. It runs on the shared write lane
 * so it lands after every memory-first write already queued — without that
 * ordering it could read a balance that a pending purchase has already spent.
 */
export class BankService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly itemCatalog: ItemCatalog,
    private readonly persist?: EconomyPersistStore,
    private readonly store?: BankStore,
    private readonly registry?: SessionRegistry,
  ) {}

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  /** Opens the bank window straight from the cached balance. */
  open(
    session: Session,
    npc: Npc,
    onOpened: () => void,
    onFailed: () => void,
  ): "started" | "unavailable" {
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    const snapshot = player
      ? this.items.inventorySnapshot(player.id)
      : undefined;
    if (!player || !snapshot || this.world.getCreature(npc.id) !== npc) {
      return "unavailable";
    }
    if (!this.isBanker(npc) || !inNpcTalkRange(player, npc)) {
      return "unavailable";
    }
    session.send({
      type: "bank-opened",
      npcId: npc.id,
      npcName: npc.name,
      balance: snapshot.bankBalance,
    });
    onOpened();
    return "started";
  }

  handle(session: Session, intent: BankIntent, now: number): void {
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
      now,
      (balance) => session.send({ type: "bank-updated", balance }),
      (reason) => this.fail(session, reason),
    );
  }

  /**
   * Canary's free-text money keywords. The amount was typed by the player, so
   * it runs the identical validation and planning the panel uses; only the
   * reply surface differs.
   */
  handleKeyword(
    session: Session,
    npc: Npc,
    operation: "deposit" | "withdraw",
    amount: number,
    now: number,
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
    return this.run(session, player, npc, intent, now, onCommitted, onFailed);
  }

  private run(
    session: Session,
    player: Player,
    npc: Npc,
    intent: BankIntent,
    now: number,
    onCommitted: (balance: number) => void,
    onFailed: (reason: BankActionFailedReason) => void,
  ): "started" | "unavailable" {
    if (
      !session.knownCreatureIds.has(npc.id) ||
      !this.isBanker(npc) ||
      !inNpcTalkRange(player, npc)
    ) {
      onFailed("out-of-range");
      return "unavailable";
    }
    // A DB-first operation has read rows it has not yet reconciled with memory,
    // so its items and balance are not safe to plan against.
    if (session.itemOperationPending || session.travelOperationPending) {
      onFailed("busy");
      return "unavailable";
    }
    const snapshot = this.items.inventorySnapshot(player.id);
    const persist = this.persist;
    if (!snapshot || !persist) {
      onFailed("failed");
      return "unavailable";
    }
    if (intent.type === "bank-transfer") {
      return this.transfer(session, player, intent, onCommitted, onFailed);
    }
    const common = {
      characterId: player.id,
      catalog: this.itemCatalog,
      carried: {
        items: snapshot.items,
        capacityMax: snapshot.capacityMax,
        bankBalance: snapshot.bankBalance,
      },
      amount: intent.amount,
    };
    const planned =
      intent.type === "bank-deposit"
        ? planBankDeposit(common)
        : planBankWithdraw(common);
    if (planned.status !== "planned") {
      onFailed(planned.status);
      return "unavailable";
    }
    this.commit(
      session,
      player,
      now,
      planned.mutation,
      planned.persist,
      planned.bankBalanceAfter,
    );
    onCommitted(planned.bankBalanceAfter);
    return "started";
  }

  /** Applies a planned money mutation this tick and queues its transaction. */
  private commit(
    session: Session,
    player: Player,
    now: number,
    mutation: ItemMutation,
    plan: EconomyPersistPlan,
    bankBalanceAfter: number,
  ): void {
    this.items.applyCommittedMutation(session, player.id, mutation, now);
    this.items.setBankBalance(player.id, bankBalanceAfter);
    const persist = this.persist;
    if (persist) {
      this.items.enqueuePersist(session, player.id, () => persist.persist(plan));
    }
  }

  private transfer(
    session: Session,
    player: Player,
    intent: BankTransferMessage,
    onCommitted: (balance: number) => void,
    onFailed: (reason: BankActionFailedReason) => void,
  ): "started" | "unavailable" {
    const store = this.store;
    if (!store) {
      onFailed("failed");
      return "unavailable";
    }
    session.itemOperationPending = true;
    // Ordered on the shared write lane: the transaction reads the sender's
    // balance only after every queued memory-first write has landed.
    const operation = this.items
      .runOrderedInternalOperation(() =>
        store.transfer(player.id, intent.toCharacterName, intent.amount),
      )
      .then(
        (result) => {
          this.outcomes.push(() => {
            session.itemOperationPending = false;
            if (result.status !== "committed") {
              onFailed(result.status);
              return;
            }
            if (session.playerId === player.id) {
              this.items.setBankBalance(player.id, result.balance);
              onCommitted(result.balance);
            }
            this.creditRecipient(result.toCharacterId, result.toBalance);
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
   * Hands the recipient their own new balance. An offline recipient needs
   * nothing: the transaction already wrote their row, and their next login
   * loads it. Nothing about the sender travels with it beyond what the transfer
   * itself already reveals (charter rule 6).
   */
  private creditRecipient(toCharacterId: string, balance: number): void {
    const recipient = this.registry?.sessionFor(toCharacterId);
    if (!recipient) return;
    this.items.setBankBalance(toCharacterId, balance);
    recipient.send({ type: "bank-updated", balance });
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
