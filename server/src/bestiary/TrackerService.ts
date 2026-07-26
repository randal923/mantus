import {
  BESTIARY_LIMITS,
  BOSSTIARY_MILESTONES,
  type TrackerEntry,
  type TrackerSetMessage,
  type TrackerStateMessage,
} from "@tibia/protocol";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { BestiaryCatalog } from "./BestiaryCatalog";
import type { BestiaryTracker } from "./BestiaryTracker";
import { getBestiaryStage } from "./getBestiaryStage";
import { getBossMilestones } from "./getBossMilestones";
import type { TrackerStore } from "./TrackerStore";

interface TrackedSets {
  readonly bestiary: Set<number>;
  readonly bosstiary: Set<number>;
}

/**
 * Cyclopedia kill trackers (Feature 76), mirroring Canary's 0x2A/0xB9 pair:
 * one race toggled per intent, 255 entries per list, boss tracking gated on
 * at least one kill. Projections are always the requesting character's own
 * counts (charter rule 6); per-kill updates ride the existing
 * `bestiary-entry-changed` push.
 */
export class TrackerService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly trackedByCharacter = new Map<string, TrackedSets>();

  constructor(
    private readonly registry: SessionRegistry,
    private readonly catalog: BestiaryCatalog,
    private readonly kills: BestiaryTracker,
    private readonly store?: TrackerStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
  }

  detachCharacter(characterId: string): void {
    this.trackedByCharacter.delete(characterId);
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) {
      this.trackedByCharacter.set(characterId, {
        bestiary: new Set(),
        bosstiary: new Set(),
      });
      return;
    }
    this.track(
      store.load(characterId).then(
        (snapshot) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.trackedByCharacter.set(characterId, {
              bestiary: new Set(snapshot.bestiary),
              bosstiary: new Set(snapshot.bosstiary),
            });
            session.send(this.projectState(characterId, "bestiary"));
            session.send(this.projectState(characterId, "bosstiary"));
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`tracker load failed for ${characterId}: ${reason}`);
        },
      ),
    );
  }

  handle(session: Session, intent: TrackerSetMessage, now: number): void {
    const characterId = session.playerId;
    if (!characterId) return;
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) return;
    this.cooldownBySession.set(
      session.id,
      now + BESTIARY_LIMITS.actionCooldownMs,
    );
    const tracked = this.trackedByCharacter.get(characterId);
    if (!tracked) return;
    const set = intent.scope === "bosstiary" ? tracked.bosstiary : tracked.bestiary;
    if (intent.enabled) {
      const known =
        intent.scope === "bosstiary"
          ? this.catalog.bossesByRaceId.has(intent.raceId)
          : this.catalog.entriesByRaceId.has(intent.raceId);
      if (!known) return;
      // Canary gates boss tracking on at least one kill (protocolgame.cpp:3585).
      if (
        intent.scope === "bosstiary" &&
        (this.kills.killsFor(characterId).get(intent.raceId) ?? 0) === 0
      ) {
        return;
      }
      // Overflow is a silent no-op, exactly like player.cpp:927-945.
      if (
        set.size >= BESTIARY_LIMITS.maxTrackedEntries ||
        set.has(intent.raceId)
      ) {
        session.send(this.projectState(characterId, intent.scope));
        return;
      }
      set.add(intent.raceId);
    } else if (!set.delete(intent.raceId)) {
      session.send(this.projectState(characterId, intent.scope));
      return;
    }
    this.persist(characterId, intent.scope, intent.raceId, intent.enabled);
    session.send(this.projectState(characterId, intent.scope));
  }

  private projectState(
    characterId: string,
    scope: "bestiary" | "bosstiary",
  ): TrackerStateMessage {
    const tracked = this.trackedByCharacter.get(characterId);
    const kills = this.kills.killsFor(characterId);
    const entries: TrackerEntry[] = [];
    const set = scope === "bosstiary" ? tracked?.bosstiary : tracked?.bestiary;
    for (const raceId of set ?? []) {
      const count = kills.get(raceId) ?? 0;
      if (scope === "bestiary") {
        const entry = this.catalog.entriesByRaceId.get(raceId);
        if (!entry) continue;
        entries.push({
          raceId,
          name: entry.monsterType.name,
          kills: count,
          firstUnlock: entry.firstUnlock,
          secondUnlock: entry.secondUnlock,
          toKill: entry.toKill,
          completed: getBestiaryStage(entry, count) === 4,
        });
        continue;
      }
      const boss = this.catalog.bossesByRaceId.get(raceId);
      if (!boss) continue;
      const milestones = BOSSTIARY_MILESTONES[boss.category];
      entries.push({
        raceId,
        name: boss.monsterType.name,
        kills: count,
        firstUnlock: milestones[0]?.kills ?? 1,
        secondUnlock: milestones[1]?.kills ?? 1,
        toKill: milestones[2]?.kills ?? 1,
        completed: getBossMilestones(boss.category, count).reached === 3,
      });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return { type: "tracker-state", scope, entries };
  }

  private persist(
    characterId: string,
    scope: "bestiary" | "bosstiary",
    raceId: number,
    enabled: boolean,
  ): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store.set(characterId, scope, raceId, enabled).catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(
          `tracker persist failed for ${characterId} ${scope}:${raceId}: ${reason}`,
        );
      }),
    );
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }
}
