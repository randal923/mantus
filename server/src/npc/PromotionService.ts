import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { SpellRegistry } from "../combat/SpellRegistry";
import type { Npc } from "../creature/Npc";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import { getVocation } from "../progression/getVocation";
import type { Session } from "../Session";
import type { World } from "../World";
import type { PromotionStore } from "./PromotionStore";

type PromotionFailure =
  | "already-promoted"
  | "level-too-low"
  | "insufficient-funds"
  | "failed";

export class PromotionService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly world: World,
    private readonly persistence: CharacterPersistence,
    private readonly items: ItemIntentHandler,
    private readonly progression: ProgressionSystem,
    private readonly spells: SpellRegistry,
    private readonly store?: PromotionStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  start(
    session: Session,
    npc: Npc,
    minimumLevel: number,
    cost: number,
    now: number,
    onCommitted: (committedAt: number) => void,
    onFailed: (failedAt: number, reason: PromotionFailure) => void,
  ):
    | "started"
    | "busy"
    | "already-promoted"
    | "level-too-low"
    | "unavailable" {
    const store = this.store;
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!store || !player || this.world.getCreature(npc.id) !== npc) {
      return "unavailable";
    }
    if (!this.inTalkRange(player, npc)) return "unavailable";
    if (!getVocation(player.vocation).promotedVocation) {
      return "already-promoted";
    }
    if (player.level < minimumLevel) return "level-too-low";
    if (session.itemOperationPending || session.itemPersistsPending > 0) {
      return "busy";
    }
    session.itemOperationPending = true;
    session.promotionOperationPending = true;
    const expectedVersion = this.persistence.beginExternalMutation(player, now);
    const operation = expectedVersion.then(async (version) => ({
      expectedVersion: version,
      result: await store.commit(
        player.id,
        version,
        minimumLevel,
        cost,
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
          session.promotionOperationPending = false;
          player.promote(result.vocation, committedAt);
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
          this.progression.notifyCommittedPlayer(player, committedAt);
          session.send({
            type: "vocation-updated",
            playerId: player.id,
            vocation: player.vocation,
            spells: this.spells.projectFor(player),
          });
          onCommitted(committedAt);
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`promotion failed for character ${player.id}: ${reason}`);
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
    reason: PromotionFailure,
    onFailed: (failedAt: number, reason: PromotionFailure) => void,
  ): void {
    session.itemOperationPending = false;
    session.promotionOperationPending = false;
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
