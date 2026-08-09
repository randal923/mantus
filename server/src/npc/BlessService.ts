import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Npc } from "../creature/Npc";
import { getAccountStatus } from "../getAccountStatus";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import { planBlessingPurchase } from "../progression/planBlessingPurchase";
import { ResolvedOutcomes } from "../ResolvedOutcomes";
import type { Session } from "../Session";
import type { World } from "../World";
import type { BlessStore } from "./BlessStore";

export type BlessFailure = "already-blessed" | "insufficient-funds" | "failed";

export type BlessStart =
  | "started"
  | "busy"
  | "already-blessed"
  | "premium-required"
  | "unavailable";

/**
 * Buying blessings from an NPC. Every gate is re-checked here, inside the
 * tick, at the moment the branch executes — and again from database truth
 * inside the store's transaction (charter rule 4). The money leg, the grant,
 * and the audit row are one transaction (charter rules 2/11).
 */
export class BlessService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly world: World,
    private readonly persistence: CharacterPersistence,
    private readonly items: ItemIntentHandler,
    private readonly store?: BlessStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  start(
    session: Session,
    npc: Npc,
    blessingIds: ReadonlyArray<number>,
    surchargePercent: number,
    premium: boolean,
    now: number,
    onCommitted: (committedAt: number) => void,
    onFailed: (failedAt: number, reason: BlessFailure) => void,
  ): BlessStart {
    const store = this.store;
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!store || !player || this.world.getCreature(npc.id) !== npc) {
      return "unavailable";
    }
    if (!this.inTalkRange(player, npc)) return "unavailable";
    // Premium is re-derived from the account row's expiry at execution time,
    // not from anything the client or an earlier check reported.
    if (
      premium &&
      (!session.account ||
        getAccountStatus(session.account, now).accountTier !== "premium")
    ) {
      return "premium-required";
    }
    const plan = planBlessingPurchase(
      blessingIds,
      player.blessingsMask,
      player.level,
      surchargePercent,
    );
    if (plan.missingIds.length === 0) return "already-blessed";
    if (session.itemOperationPending || session.itemPersistsPending > 0) {
      return "busy";
    }
    session.itemOperationPending = true;
    const expectedVersion = this.persistence.beginExternalMutation(player, now);
    const operation = expectedVersion.then(async (version) => ({
      expectedVersion: version,
      result: await store.commit(
        player.id,
        version,
        blessingIds,
        surchargePercent,
        npc.type.id,
      ),
    }));
    const resolution = operation
      .then(({ expectedVersion: version, result }) => {
        if (result.status !== "committed") {
          this.outcomes.push((failedAt) => {
            this.fail(session, player, failedAt, result.status, onFailed);
          });
          return;
        }
        this.outcomes.push((committedAt) => {
          session.itemOperationPending = false;
          player.grantBlessings(result.grantedMask);
          this.persistence.completeExternalMutation(
            player,
            version,
            result.characterVersion,
          );
          this.items.applyCommittedMutation(
            session,
            player.id,
            result.mutation,
            committedAt,
          );
          onCommitted(committedAt);
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`bless purchase failed for character ${player.id}: ${reason}`);
        this.outcomes.push((failedAt) => {
          this.fail(session, player, failedAt, "failed", onFailed);
        });
      });
    this.pendingOperations.add(resolution);
    this.items.trackExternalOperation(player.id, resolution);
    void resolution.finally(() => this.pendingOperations.delete(resolution));
    return "started";
  }

  private fail(
    session: Session,
    player: Player,
    failedAt: number,
    reason: BlessFailure,
    onFailed: (failedAt: number, reason: BlessFailure) => void,
  ): void {
    session.itemOperationPending = false;
    this.persistence.cancelExternalMutation(player);
    if (this.world.getPlayer(player.id) === player) {
      this.persistence.saveNow(player, failedAt);
    }
    onFailed(failedAt, reason);
  }

  private inTalkRange(player: Player, npc: Npc): boolean {
    const range = npc.type.dialogue?.talkRange ?? 0;
    return player.position.z === npc.position.z &&
      Math.max(
        Math.abs(player.position.x - npc.position.x),
        Math.abs(player.position.y - npc.position.y),
      ) <= range;
  }
}
