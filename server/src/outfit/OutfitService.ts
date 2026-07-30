import {
  OUTFIT_LIMITS,
  type MountEntitlement,
  type OutfitActionFailedReason,
  type OutfitEntitlement,
  type OutfitGetMessage,
  type OutfitSelectMessage,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { LoginLoadQueue } from "../character/LoginLoadQueue";
import { MOUNTS, OUTFITS, STARTER_LOOK_TYPES } from "./outfitCatalog";
import type { OutfitSnapshot, OutfitStore } from "./OutfitStore";

type OutfitIntent = OutfitGetMessage | OutfitSelectMessage;

/**
 * Server-owned outfit and mount entitlements.
 *
 * The client never decides what it may wear: it sends a request, the store
 * re-checks the look type, every requested addon bit, and the mount against
 * the character's own rows inside one transaction, and only a committed
 * result reaches the live creature — so an unentitled outfit never enters
 * another player's view (charter rules 1, 4, and 6).
 *
 * The mount's speed bonus is applied here too, from the pinned catalog rather
 * than from anything the client sends (charter rule 8).
 */
export class OutfitService {
  private readonly outcomes: Array<() => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly snapshots = new Map<string, OutfitSnapshot>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly store?: OutfitStore,
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

  /**
   * Loads entitlements and back-fills the starter outfits for the character's
   * sex, so a character created before an outfit joined the starter set still
   * owns it — and never owns the other sex's wardrobe.
   *
   * Reads before it writes: the back-fill only exists for characters that
   * predate a starter-set change, so granting first made every login pay one
   * write per starter outfit for a set it already owned. The common path is now
   * a single read.
   */
  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    const player = this.world.getPlayer(characterId);
    if (!store || !player) return;
    const starterLookTypes = STARTER_LOOK_TYPES[player.sex];
    this.track(
      (async () => {
        const snapshot = await this.loginLoads.run(characterId, () =>
          store.loadSnapshot(characterId),
        );
        const owned = new Set(snapshot.outfits.map((entry) => entry.lookType));
        const missing = starterLookTypes.filter(
          (lookType) => !owned.has(lookType),
        );
        if (missing.length === 0) return snapshot;
        for (const lookType of missing) {
          await store.grantOutfit({ characterId, lookType, addons: 0 });
        }
        return store.loadSnapshot(characterId);
      })().then(
        (snapshot) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.snapshots.set(characterId, snapshot);
            this.applyMountSpeed(characterId);
            this.sendState(session, characterId);
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  detachCharacter(characterId: string): void {
    this.snapshots.delete(characterId);
  }

  /** Grants one catalog outfit; an unknown or wrong-sex look type is ignored. */
  grantOutfit(characterId: string, lookType: number, addons = 0): void {
    const store = this.store;
    const sex = this.world.getPlayer(characterId)?.sex;
    if (!store || OUTFITS.get(lookType)?.sex !== sex) return;
    this.track(
      store.grantOutfit({ characterId, lookType, addons }).then(
        () => this.reload(characterId),
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  /** Grants one catalog mount; an unknown mount id is ignored. */
  grantMount(characterId: string, mountId: number): void {
    const store = this.store;
    if (!store || !MOUNTS.has(mountId)) return;
    this.track(
      store.grantMount({ characterId, mountId }).then(
        () => this.reload(characterId),
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  /**
   * Re-reads entitlements another transaction already committed (a Mantus
   * Store purchase). Refresh-only — it grants nothing, so a replayed purchase
   * cannot hand out a second outfit.
   */
  refresh(characterId: string): void {
    this.reload(characterId);
  }

  handle(session: Session, intent: OutfitIntent, now: number): void {
    const characterId = session.playerId;
    const player = characterId ? this.world.getPlayer(characterId) : undefined;
    if (!characterId || !player) {
      session.sendError("join-required");
      return;
    }
    const store = this.store;
    if (!store) {
      this.fail(session, "invalid-request");
      return;
    }
    if (intent.type === "outfit-get") {
      this.sendState(session, characterId);
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(
      session.id,
      now + OUTFIT_LIMITS.changeCooldownMs,
    );
    // A look type outside the pinned catalog — or belonging to the other sex —
    // is refused before the store is even asked; the store then re-checks
    // entitlement inside its transaction.
    if (OUTFITS.get(intent.lookType)?.sex !== player.sex) {
      this.fail(session, "not-owned");
      return;
    }
    if (intent.mountId !== 0 && !MOUNTS.has(intent.mountId)) {
      this.fail(session, "not-owned");
      return;
    }
    this.track(
      store
        .select({
          characterId,
          lookType: intent.lookType,
          head: intent.head,
          body: intent.body,
          legs: intent.legs,
          feet: intent.feet,
          addons: intent.addons,
          mountId: intent.mountId,
        })
        .then(
          (result) => {
            this.outcomes.push(() => {
              if (this.registry.sessionFor(characterId) !== session) return;
              if (result.status === "failed") {
                this.fail(session, result.reason);
                return;
              }
              const live = this.world.getPlayer(characterId);
              if (!live) return;
              // Only now does the outfit reach the world.
              live.outfit = {
                lookType: intent.lookType,
                head: intent.head,
                body: intent.body,
                legs: intent.legs,
                feet: intent.feet,
                addons: intent.addons,
              };
              live.mountId = intent.mountId;
              this.applyMountSpeed(characterId);
              this.visibility.onCreatureStateChanged(live);
              this.persistence.markDirty(live);
              this.sendState(session, characterId);
            });
          },
          (cause: unknown) => this.warn(characterId, cause),
        ),
    );
  }

  /** The mount's catalog speed, applied to the server's own step timing. */
  private applyMountSpeed(characterId: string): void {
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    const mount = MOUNTS.get(player.mountId);
    player.setMountSpeedBonus(mount?.speed ?? 0);
    player.mountLookType = mount?.lookType ?? 0;
  }

  private reload(characterId: string): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store.loadSnapshot(characterId).then(
        (snapshot) => {
          this.outcomes.push(() => {
            const session = this.registry.sessionFor(characterId);
            this.snapshots.set(characterId, snapshot);
            if (session?.playerId === characterId) {
              this.sendState(session, characterId);
            }
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  /**
   * The character's granted outfits/mounts as catalog-resolved entitlement
   * entries; empty until the login load resolves. Read by the podium's
   * execution-time ownership re-checks as well as the outfit window. Rows
   * belonging to the other sex are dropped here, so a stale grant can neither
   * be listed nor pass the selection check.
   */
  entitlementsFor(characterId: string): {
    outfits: OutfitEntitlement[];
    mounts: MountEntitlement[];
  } {
    const snapshot = this.snapshots.get(characterId);
    const sex = this.world.getPlayer(characterId)?.sex;
    if (!snapshot || !sex) return { outfits: [], mounts: [] };
    const outfits: OutfitEntitlement[] = snapshot.outfits.flatMap((entry) => {
      const definition = OUTFITS.get(entry.lookType);
      return definition && definition.sex === sex
        ? [
            {
              lookType: entry.lookType,
              name: definition.name,
              addons: entry.addons,
            },
          ]
        : [];
    });
    const mounts: MountEntitlement[] = snapshot.mounts.flatMap((mountId) => {
      const definition = MOUNTS.get(mountId);
      return definition
        ? [
            {
              mountId,
              name: definition.name,
              lookType: definition.lookType,
              speed: definition.speed,
            },
          ]
        : [];
    });
    return { outfits, mounts };
  }

  private sendState(session: Session, characterId: string): void {
    const snapshot = this.snapshots.get(characterId);
    const player = this.world.getPlayer(characterId);
    if (!snapshot || !player) return;
    const { outfits, mounts } = this.entitlementsFor(characterId);
    session.send({
      type: "outfit-state",
      outfits,
      mounts,
      selectedLookType: player.outfit.lookType,
      selectedMountId: player.mountId,
    });
  }

  private fail(session: Session, reason: OutfitActionFailedReason): void {
    session.send({ type: "outfit-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`outfit operation failed (${context}): ${reason}`);
  }
}
