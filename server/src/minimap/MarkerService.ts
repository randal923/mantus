import {
  MINIMAP_LIMITS,
  type MinimapMarker,
  type MinimapMarkerDeleteMessage,
  type MinimapMarkerSetMessage,
} from "@tibia/protocol";
import { LoginLoadQueue } from "../character/LoginLoadQueue";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { MarkerStore } from "./MarkerStore";

type MarkerIntent = MinimapMarkerSetMessage | MinimapMarkerDeleteMessage;

/**
 * Per-character minimap markers. The list is private to its owner and has no
 * gameplay effect, so the only rules that matter are the ones that keep it
 * bounded: one mutation per cooldown per session, and a cap re-counted inside
 * the store's transaction (charter rules 6 and 10).
 */
export class MarkerService {
  private readonly outcomes: Array<() => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly store?: MarkerStore,
    private readonly loginLoads: LoginLoadQueue = new LoginLoadQueue(),
  ) {}

  applyResolvedOutcomes(): void {
    for (const outcome of this.outcomes.splice(0)) outcome();
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  attachCharacter(session: Session, characterId: string): void {
    this.reload(session, characterId, true);
  }

  handle(session: Session, intent: MarkerIntent, now: number): void {
    const characterId = session.playerId;
    const store = this.store;
    if (!characterId || !this.world.getPlayer(characterId) || !store) {
      session.sendError("join-required");
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) return;
    this.cooldownBySession.set(
      session.id,
      now + MINIMAP_LIMITS.markerCooldownMs,
    );
    const operation =
      intent.type === "minimap-marker-set"
        ? store.setMarker({
            characterId,
            marker: {
              position: intent.position,
              icon: intent.icon,
              text: intent.text,
            } satisfies MinimapMarker,
            maxMarkers: MINIMAP_LIMITS.maxMarkers,
          })
        : store.deleteMarker({ characterId, position: intent.position });
    this.track(
      Promise.resolve(operation).then(
        () => {
          this.outcomes.push(() => this.reload(session, characterId));
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  /**
   * `atLogin` routes the read through the login queue so world entry does not
   * add another concurrent pool checkout; a reload after a marker mutation is
   * a lone query and goes straight to the store.
   */
  private reload(session: Session, characterId: string, atLogin = false): void {
    const store = this.store;
    if (!store) return;
    const load = () => store.loadMarkers(characterId);
    this.track(
      (atLogin ? this.loginLoads.run(characterId, load) : load()).then(
        (markers) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            session.send({ type: "minimap-markers", markers: [...markers] });
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`marker operation failed (${context}): ${reason}`);
  }
}
