import {
  PODIUM_LIMITS,
  type PodiumActionFailedReason,
  type PodiumRaceEntry,
  type PodiumSetMessage,
  type Position,
} from "@tibia/protocol";
import type { WorldAction } from "../action/WorldAction";
import { checkWorldActionPreconditions } from "../action/worldActionPreconditions";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planSetPodiumMapItem } from "../item/plan/planSetPodiumMapItem";
import type { MapItem } from "../MapItem";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { PODIUM_DEFINITIONS } from "./PodiumDefinition";
import type { PodiumHooks } from "./PodiumHooks";
import { podiumStateOf, type PodiumStored } from "./podiumStateOf";

/**
 * Podium show-off objects (Feature 86, Canary game.cpp:5212/11247). The use
 * action opens an edit window listing only the session's own unlocks; the
 * set intent re-resolves the item and re-checks reach, house access, the
 * claimed revision, and every entitlement at execution time. Monster looks
 * are always copied server-side from the monster type (charter rule 1).
 */
export class PodiumService {
  private readonly lastEditBySession = new WeakMap<Session, number>();

  constructor(
    private readonly world: World,
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly hooks: PodiumHooks,
    private readonly houseAccess: (
      characterId: string,
      position: Position,
    ) => boolean,
  ) {}

  /** World-action entry: project the edit window to the using session. */
  open(
    session: Session,
    player: Player,
    position: Position,
    item: MapItem,
  ): void {
    const definition = PODIUM_DEFINITIONS.get(item.itemId);
    if (!definition) return;
    const attributes =
      this.world.getWorldItem(item.instanceId)?.attributes ??
      item.source?.attributes ??
      {};
    const stored = podiumStateOf(attributes);
    const family = definition.family;
    const races: ReadonlyArray<PodiumRaceEntry> =
      family === "vigour"
        ? this.hooks.bossRaces(player.id)
        : family === "tenacity"
          ? this.hooks.bestiaryRaces(player.id)
          : [];
    session.send({
      type: "podium-window",
      itemId: item.instanceId,
      revision: this.world.getWorldItem(item.instanceId)?.version ?? 1,
      position,
      family,
      current: {
        podiumVisible: stored.podiumVisible,
        direction: stored.direction,
        lookType: stored.lookType,
        head: stored.head,
        body: stored.body,
        legs: stored.legs,
        feet: stored.feet,
        addons: stored.addons,
        mountLookType: stored.mountLookType,
        raceId: stored.raceId,
        monsterVisible: stored.monsterVisible,
      },
      outfits:
        family === "renown"
          ? this.hooks.outfits(player.id).slice(0, PODIUM_LIMITS.maxOutfitEntries)
          : [],
      mounts:
        family === "renown"
          ? this.hooks.mounts(player.id).slice(0, PODIUM_LIMITS.maxMountEntries)
          : [],
      races: races.slice(0, PODIUM_LIMITS.maxRaces),
    });
  }

  handleSet(session: Session, intent: PodiumSetMessage, now: number): void {
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (!player) return;
    const lastEdit = this.lastEditBySession.get(session) ?? 0;
    if (now - lastEdit < PODIUM_LIMITS.editCooldownMs) {
      this.fail(session, "rate-limited");
      return;
    }
    this.lastEditBySession.set(session, now);
    const mapItem = this.world
      .getMapItems(intent.position)
      .find((candidate) => candidate.instanceId === intent.itemId);
    const definition = mapItem
      ? PODIUM_DEFINITIONS.get(mapItem.itemId)
      : undefined;
    if (!mapItem || !definition) {
      this.fail(session, "stale-item");
      return;
    }
    const action: Extract<WorldAction, { kind: "podium" }> = {
      kind: "podium",
      item: mapItem,
      podium: definition,
    };
    const rejection = checkWorldActionPreconditions({
      action,
      player,
      position: intent.position,
      viewRange: session.viewRange,
      world: this.world,
      houseAccess: this.houseAccess,
      itemOperationPending:
        session.itemOperationPending || session.itemPersistsPending > 0,
    });
    if (rejection === "out-of-view") return;
    if (rejection) {
      this.fail(
        session,
        rejection === "out-of-reach"
          ? "out-of-reach"
          : rejection === "stale-item"
            ? "stale-item"
            : rejection === "no-house-access"
              ? "no-house-access"
              : "busy",
      );
      return;
    }
    const stored = this.validateSelection(player, definition.family, intent);
    if (!stored) {
      this.fail(session, "not-owned");
      return;
    }
    const plan = planSetPodiumMapItem({
      characterId: player.id,
      catalog: this.catalog,
      world: this.world,
      instanceId: intent.itemId,
      position: intent.position,
      stored,
      expectedVersion: intent.revision,
    });
    if (!plan) {
      this.fail(session, "stale-item");
      return;
    }
    this.items.applyWorldPlan(session, player.id, plan, now);
  }

  /** Entitlement re-checks at execution; null means something isn't owned. */
  private validateSelection(
    player: Player,
    family: "renown" | "vigour" | "tenacity",
    intent: PodiumSetMessage,
  ): PodiumStored | null {
    if (family === "renown") {
      if (intent.raceId !== 0) return null;
      if (intent.lookType > 0) {
        const owned = this.hooks
          .outfits(player.id)
          .find((entry) => entry.lookType === intent.lookType);
        if (!owned || (intent.addons & ~owned.addons) !== 0) return null;
      }
      if (
        intent.mountLookType > 0 &&
        !this.hooks
          .mounts(player.id)
          .some((entry) => entry.lookType === intent.mountLookType)
      ) {
        return null;
      }
      return {
        podiumVisible: intent.podiumVisible,
        direction: intent.direction,
        lookType: intent.lookType,
        head: intent.lookType > 0 ? intent.head : 0,
        body: intent.lookType > 0 ? intent.body : 0,
        legs: intent.lookType > 0 ? intent.legs : 0,
        feet: intent.lookType > 0 ? intent.feet : 0,
        addons: intent.lookType > 0 ? intent.addons : 0,
        mountLookType: intent.mountLookType,
        raceId: 0,
        monsterVisible: true,
        lookTypeEx: 0,
      };
    }
    if (intent.lookType !== 0 || intent.mountLookType !== 0) return null;
    if (intent.raceId === 0) {
      return {
        podiumVisible: intent.podiumVisible,
        direction: intent.direction,
        lookType: 0,
        head: 0,
        body: 0,
        legs: 0,
        feet: 0,
        addons: 0,
        mountLookType: 0,
        raceId: 0,
        monsterVisible: intent.monsterVisible,
        lookTypeEx: 0,
      };
    }
    const races =
      family === "vigour"
        ? this.hooks.bossRaces(player.id)
        : this.hooks.bestiaryRaces(player.id);
    const entry = races.find((race) => race.raceId === intent.raceId);
    if (!entry) return null;
    return {
      podiumVisible: intent.podiumVisible,
      direction: intent.direction,
      // The monster's look is copied from the pinned type, never the client.
      lookType: entry.outfit.lookType,
      head: entry.outfit.head,
      body: entry.outfit.body,
      legs: entry.outfit.legs,
      feet: entry.outfit.feet,
      addons: entry.outfit.addons,
      mountLookType: 0,
      raceId: intent.raceId,
      monsterVisible: intent.monsterVisible,
      lookTypeEx: entry.outfit.lookTypeEx ?? 0,
    };
  }

  private fail(session: Session, reason: PodiumActionFailedReason): void {
    session.send({ type: "podium-action-failed", reason });
  }
}
