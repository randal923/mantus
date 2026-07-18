import type { Position } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Npc } from "../creature/Npc";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import type { NpcTravelOffer } from "./DialogueGraph";
import type { NpcTravelStore } from "./NpcTravelStore";

const TRAVEL_EXHAUST_MS = 3_000;
const DESTINATION_FALLBACK_RADIUS = 2;

export class TravelService {
  private readonly nextTravelAt = new Map<string, number>();
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();

  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly items: ItemIntentHandler,
    private readonly store?: NpcTravelStore,
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
    offer: NpcTravelOffer,
    now: number,
    onCommitted: (committedAt: number) => void,
    onFailed: (
      failedAt: number,
      reason: "insufficient-funds" | "failed",
    ) => void,
  ):
    | "started"
    | "busy"
    | "exhausted"
    | "level-too-low"
    | "pz-locked"
    | "unavailable" {
    const store = this.store;
    if (!store) return "unavailable";
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!player || this.world.getCreature(npc.id) !== npc) return "unavailable";
    if (!this.inTalkRange(player, npc)) return "unavailable";
    if (offer.minimumLevel && player.level < offer.minimumLevel) {
      return "level-too-low";
    }
    if (player.conditions.has("pz-lock")) return "pz-locked";
    if (now < (this.nextTravelAt.get(player.id) ?? 0)) return "exhausted";
    if (session.itemOperationPending ||
      session.itemPersistsPending > 0 ||
      session.travelOperationPending) {
      return "busy";
    }
    const destination = this.world.findUnoccupiedPosition(
      offer.destination,
      DESTINATION_FALLBACK_RADIUS,
    );
    if (!destination) return "unavailable";
    const reservationId = `npc-travel:${player.id}:${npc.id}:${offer.id}`;
    if (!this.world.reservePosition(destination, reservationId)) {
      return "unavailable";
    }
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
    session.itemOperationPending = true;
    session.travelOperationPending = true;
    const expectedVersion = this.persistence.beginExternalMutation(player, now);
    const operation = expectedVersion.then(async (version) => ({
      expectedVersion: version,
      result: await store.commit(
        player.id,
        version,
        destination,
        offer.cost,
        npc.type.id,
        offer.id,
      ),
    }));
    const resolution = operation
      .then(({ expectedVersion: version, result }) => {
        if (result.status === "insufficient-funds") {
          this.outcomes.push((failedAt) => {
            this.fail(
              session,
              player,
              destination,
              reservationId,
              failedAt,
              "insufficient-funds",
              onFailed,
            );
          });
          return;
        }
        this.outcomes.push((committedAt) => {
          session.itemOperationPending = false;
          session.travelOperationPending = false;
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
          this.nextTravelAt.set(player.id, committedAt + TRAVEL_EXHAUST_MS);
          this.world.releasePosition(destination, reservationId);
          if (this.world.getPlayer(player.id) === player) {
            const from = this.world.relocateCreature(player, destination);
            this.clearCombatTarget(session);
            this.visibility.onPlayerTeleported(session, player, from);
          }
          onCommitted(committedAt);
        });
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`NPC travel failed for character ${player.id}: ${reason}`);
        this.outcomes.push((failedAt) => {
          this.fail(
            session,
            player,
            destination,
            reservationId,
            failedAt,
            "failed",
            onFailed,
          );
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
    destination: Position,
    reservationId: string,
    failedAt: number,
    reason: "insufficient-funds" | "failed",
    onFailed: (
      failedAt: number,
      reason: "insufficient-funds" | "failed",
    ) => void,
  ): void {
    session.itemOperationPending = false;
    session.travelOperationPending = false;
    this.world.releasePosition(destination, reservationId);
    this.persistence.cancelExternalMutation(player);
    if (this.world.getPlayer(player.id) === player) {
      this.persistence.saveNow(player, failedAt);
    }
    onFailed(failedAt, reason);
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

  private clearCombatTarget(session: Session): void {
    if (!session.attackTargetId) return;
    session.attackTargetId = null;
    session.send({ type: "attack-target-changed", creatureId: null });
  }
}
