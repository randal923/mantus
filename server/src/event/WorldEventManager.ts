import type { Position } from "@tibia/protocol";
import type { WorldActionRng } from "../action/WorldActionRng";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { WorldEventDefinition, WorldEventStage } from "./WorldEventDefinition";
import {
  WORLD_EVENT_CHECK_INTERVAL_MS,
  rollWorldEventCheck,
} from "./rollWorldEventCheck";
import type { WorldEventStore } from "./WorldEventStore";

/** Spawn placements attempted per tick, so one wave cannot stall the loop. */
const SPAWNS_PER_TICK = 8;
/** Schedules claimed per sweep. */
const CLAIMS_PER_SWEEP = 16;
/** Tries to find a free tile inside the event's area for one monster. */
const PLACEMENT_ATTEMPTS = 24;

interface ActiveRun {
  readonly idempotencyKey: string;
  readonly event: WorldEventDefinition;
  stageIndex: number;
  stageDueAt: number;
  /** Spawns left to place for the current stage, expanded one monster each. */
  pendingSpawns: Array<{ readonly name: string; readonly position?: Position }>;
}

/**
 * The durable world-event engine. Rolling is driven by the database clock
 * through `claimDueChecks` (the row is its own lease), a fire is guarded by an
 * idempotency key, and step execution happens inside the tick with bounded
 * work per tick. A restart never resumes an interrupted run and never replays
 * a fire, so it cannot produce a second boss or a second reward.
 */
export class WorldEventManager {
  private readonly runs = new Map<string, ActiveRun>();
  private readonly pending = new Set<Promise<unknown>>();
  private nextSweepAt = 0;
  private sweeping = false;
  private registered = false;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly events: ReadonlyMap<string, WorldEventDefinition>,
    private readonly rng: WorldActionRng,
    private readonly spawnMonster: (
      typeName: string,
      position: Position,
      now: number,
    ) => boolean,
    private readonly store?: WorldEventStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Registers the imported schedules and retires runs from a dead process. */
  async start(): Promise<void> {
    if (!this.store || this.events.size === 0) return;
    await this.store.register([...this.events.keys()], this.clock());
    const abandoned = await this.store.abandonStaleRuns();
    if (abandoned > 0) {
      console.log(`abandoned ${abandoned} interrupted world event run(s)`);
    }
    this.registered = true;
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }

  tick(now: number): void {
    this.advanceRuns(now);
    if (!this.registered || now < this.nextSweepAt || this.sweeping) return;
    this.nextSweepAt = now + WORLD_EVENT_CHECK_INTERVAL_MS;
    this.sweeping = true;
    this.track(
      this.sweep(now).finally(() => {
        this.sweeping = false;
      }),
    );
  }

  /**
   * Operator-triggered start. `operatorCharacterId` must already be an
   * authorized operator; the store audits the attempt either way.
   */
  requestOperatorStart(
    eventId: string,
    operatorCharacterId: string,
    now: number,
  ): "started" | "unknown-event" | "already-running" | "unavailable" {
    const store = this.store;
    const event = this.events.get(eventId);
    if (!store) return "unavailable";
    if (!event) {
      this.track(
        store.recordOperatorAction({
          eventId,
          operatorCharacterId,
          action: "start",
          accepted: false,
        }),
      );
      return "unknown-event";
    }
    if (this.runs.has(eventId)) return "already-running";
    const idempotencyKey = `${eventId}:operator:${this.clock().getTime()}`;
    this.track(
      (async () => {
        await store.recordOperatorAction({
          eventId,
          operatorCharacterId,
          action: "start",
          accepted: true,
        });
        if (
          await store.beginRun({
            idempotencyKey,
            eventId,
            trigger: "operator",
            operatorCharacterId,
          })
        ) {
          this.beginLocalRun(event, idempotencyKey, now);
        }
      })(),
    );
    return "started";
  }

  get activeEventIds(): ReadonlyArray<string> {
    return [...this.runs.keys()];
  }

  private async sweep(now: number): Promise<void> {
    const store = this.store;
    if (!store) return;
    const claimedAt = this.clock();
    const claims = await store.claimDueChecks(
      claimedAt,
      WORLD_EVENT_CHECK_INTERVAL_MS,
      CLAIMS_PER_SWEEP,
    );
    const activePlayers = this.world.playerCount;
    for (const claim of claims) {
      const event = this.events.get(claim.eventId);
      if (!event) continue;
      // A run already in flight for this event must never be restarted.
      const outcome = this.runs.has(event.id)
        ? {
            fired: false,
            failedAttempts: claim.failedAttempts,
            checksToday: claim.checksToday + 1,
            triggerWhenPossible: claim.triggerWhenPossible,
          }
        : rollWorldEventCheck({
            event,
            state: {
              failedAttempts: claim.failedAttempts,
              checksToday: claim.checksToday,
              triggerWhenPossible: claim.triggerWhenPossible,
              lastOccurrenceAt: claim.lastOccurrenceAt,
            },
            checkedAt: claim.checkedAt,
            activePlayers,
            roll: this.rng.integer(1, 100_000),
          });
      await store.recordCheckOutcome({
        eventId: event.id,
        failedAttempts: outcome.failedAttempts,
        checksToday: outcome.checksToday,
        triggerWhenPossible: outcome.triggerWhenPossible,
        fired: outcome.fired,
      });
      if (!outcome.fired) continue;
      const idempotencyKey = `${event.id}:${claim.checkedAt.toISOString()}`;
      if (
        await store.beginRun({
          idempotencyKey,
          eventId: event.id,
          trigger: "schedule",
        })
      ) {
        this.beginLocalRun(event, idempotencyKey, now);
      }
    }
  }

  private beginLocalRun(
    event: WorldEventDefinition,
    idempotencyKey: string,
    now: number,
  ): void {
    if (this.runs.has(event.id)) return;
    this.runs.set(event.id, {
      idempotencyKey,
      event,
      stageIndex: 0,
      stageDueAt: now,
      pendingSpawns: [],
    });
  }

  private advanceRuns(now: number): void {
    for (const [eventId, run] of this.runs) {
      if (run.pendingSpawns.length > 0) {
        this.placeSpawns(run, now);
        continue;
      }
      if (now < run.stageDueAt) continue;
      const stage = run.event.stages[run.stageIndex];
      if (!stage) {
        this.runs.delete(eventId);
        const store = this.store;
        if (store) this.track(store.finishRun(run.idempotencyKey));
        continue;
      }
      run.stageIndex += 1;
      run.stageDueAt = now + stage.advanceAfterMs;
      this.enterStage(run, stage, now);
    }
  }

  private enterStage(
    run: ActiveRun,
    stage: WorldEventStage,
    now: number,
  ): void {
    if (stage.kind === "announce") {
      this.announce(stage.message);
      return;
    }
    run.pendingSpawns = stage.monsters.flatMap((monster) =>
      Array.from({ length: monster.amount }, () => ({
        name: monster.name,
        ...(monster.position === undefined
          ? {}
          : { position: monster.position }),
      })),
    );
    this.placeSpawns(run, now);
  }

  private placeSpawns(run: ActiveRun, now: number): void {
    for (let placed = 0; placed < SPAWNS_PER_TICK; placed += 1) {
      const spawn = run.pendingSpawns.shift();
      if (!spawn) return;
      const position = spawn.position ?? this.randomAreaPosition(run.event);
      if (!position) continue;
      this.spawnMonster(spawn.name, position, now);
    }
  }

  /** A walkable, unoccupied tile inside one of the event's areas. */
  private randomAreaPosition(event: WorldEventDefinition): Position | null {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt += 1) {
      const area = this.rng.pick(event.areas);
      const position = {
        x: this.rng.integer(
          Math.min(area.from.x, area.to.x),
          Math.max(area.from.x, area.to.x),
        ),
        y: this.rng.integer(
          Math.min(area.from.y, area.to.y),
          Math.max(area.from.y, area.to.y),
        ),
        z: this.rng.integer(
          Math.min(area.from.z, area.to.z),
          Math.max(area.from.z, area.to.z),
        ),
      };
      if (!this.world.isWalkable(position)) continue;
      if (this.world.isOccupied(position)) continue;
      return position;
    }
    return null;
  }

  /**
   * Canary broadcasts raid announcements to every online player. It carries no
   * position or internal state, so there is nothing here a player could not
   * already see (charter rule 6).
   */
  private announce(message: string): void {
    for (const session of this.registry.all()) {
      if (!session.playerId) continue;
      session.send({ type: "combat-log", kind: "condition", text: message });
    }
  }

  private track(operation: Promise<unknown>): void {
    const tracked = operation.catch((cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : "unknown";
      console.warn(`world event operation failed: ${reason}`);
    });
    this.pending.add(tracked);
    void tracked.finally(() => this.pending.delete(tracked));
  }
}
