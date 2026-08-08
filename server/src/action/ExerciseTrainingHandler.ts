import {
  PREMIUM_BENEFITS,
  type Position,
  type UseItemWithMessage,
} from "@tibia/protocol";
import { MISSILE_DURATION_MS } from "../combat/combatConstants";
import { chargesOf } from "../item/chargesOf";
import { isNear } from "../item/isNear";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import {
  computeExerciseTrainingGain,
  exerciseTrainingIntervalMs,
} from "../progression/exerciseTraining";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { getExerciseDummyRate } from "./getExerciseDummyRate";
import {
  getExerciseWeaponDefinition,
  type ExerciseWeaponDefinition,
} from "./getExerciseWeaponDefinition";

/** Canary's `exhaustionTime` in exercise_training_weapons.lua. */
const START_EXHAUST_MS = 10_000;
/** Canary's `maxAllowedOnADummy`; only house dummies are capped. */
const MAX_PLAYERS_PER_HOUSE_DUMMY = 1;
/** The free dummy's rate; anything above it is a house dummy. */
const FREE_DUMMY_RATE = 100;
/** Canary allowFarUse still requires the same floor and line of sight. */
const FAR_USE_RANGE = { x: 7, y: 5 } as const;

/** Charges one write may buy, so a stall cannot spend a weapon outright. */
const MAX_CHARGES_PER_WRITE = 64;

interface ActiveTraining {
  readonly weaponItemId: string;
  readonly weaponTypeId: number;
  readonly dummyPosition: Position;
  readonly dummyTypeId: number;
  /** When the next paid-for hit is drawn. */
  nextAt: number;
  /** Charges committed and awarded, whose hits have not been drawn yet. */
  creditedHits: number;
  /** How long the last charge write took, which sets the next bundle's size. */
  lastWriteMs: number;
  writeStartedAt: number | null;
  /** True once a write spent the weapon's last charge and removed the row. */
  spentOut: boolean;
}

/**
 * Exercise-weapon training, ported from Canary's
 * `data/scripts/actions/items/exercise_training_weapons.lua`.
 *
 * Every rule is re-checked on the tick that pays, not when the intent arrived
 * (charter rule 4): the dummy must still be on its tile, the trainer must
 * still stand in a protection zone, and the weapon must still be carried at
 * the revision the charges are spent against. Charges are spent by a single
 * atomic store operation and the skill is awarded only once that commits, so a
 * failed write can never hand out free progress.
 *
 * Charges are bought in bundles rather than one per hit. One charge write is a
 * serializable transaction, so its round trip — a millisecond against a local
 * database, near half a second against a remote one — used to be the real
 * ceiling on the training rate: a tier could only hit as fast as the database
 * answered, which made the fast tiers no faster than the slow ones wherever
 * the database was not next door. Each write now buys
 * as many charges as the previous write's latency covers, the tick draws and
 * paces the hits it has already paid for, and the bundle collapses to a single
 * charge when the database is quick. Charges are always deducted and awarded
 * before their hits are drawn, so a crash or a logout mid-bundle can only cost
 * the player the drawing, never hand out an unpaid try.
 */
export class ExerciseTrainingHandler {
  private readonly active = new Map<string, ActiveTraining>();
  private readonly exhaustedUntil = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly items: ItemIntentHandler,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly progression: ProgressionSystem,
    private readonly speedRate: number,
  ) {}

  /** True when the intent was consumed as an exercise-training use. */
  handle(session: Session, intent: UseItemWithMessage, now: number): boolean {
    const playerId = session.playerId;
    if (!playerId) return false;
    const player = this.world.getPlayer(playerId);
    if (!player) return false;
    const item = this.items
      .inventorySnapshot(playerId)
      ?.items.find((candidate) => candidate.id === intent.itemId);
    // Missing or stale items fall through to the item handler, which reports
    // the failure through its regular validation path.
    if (!item || item.version !== intent.revision) return false;
    const weapon = getExerciseWeaponDefinition(item.typeId);
    if (!weapon) return false;
    const dummy = this.dummyAt(intent.targetPosition);
    if (!dummy) return false;

    if (this.active.has(playerId)) {
      this.say(session, "You are already training!");
      return true;
    }
    if (!this.inReach(player.position, intent.targetPosition, weapon.allowFarUse)) {
      this.say(session, "Get closer to the dummy.");
      return true;
    }
    if (!this.world.isProtectionZone(player.position)) {
      this.say(session, "You need to be in a protection zone.");
      return true;
    }
    if (dummy.rate > FREE_DUMMY_RATE && this.dummyIsBusy(intent.targetPosition)) {
      this.say(session, "That exercise dummy is busy.");
      return true;
    }
    if (now < (this.exhaustedUntil.get(playerId) ?? 0)) {
      this.say(
        session,
        `This exercise dummy can only be used after a ${
          START_EXHAUST_MS / 1_000
        } seconds cooldown.`,
      );
      return true;
    }

    this.exhaustedUntil.set(playerId, now + START_EXHAUST_MS);
    this.active.set(playerId, {
      weaponItemId: item.id,
      weaponTypeId: item.typeId,
      dummyPosition: { ...intent.targetPosition },
      dummyTypeId: dummy.typeId,
      // Canary's first addEvent fires with no delay.
      nextAt: now,
      creditedHits: 0,
      lastWriteMs: 0,
      writeStartedAt: null,
      spentOut: false,
    });
    this.say(session, "You have started training on an exercise dummy.");
    return true;
  }

  /** Ends training started by this player, e.g. on logout. */
  stop(playerId: string): void {
    this.active.delete(playerId);
    this.exhaustedUntil.delete(playerId);
  }

  tick(now: number): void {
    for (const [playerId, training] of this.active) {
      this.runTrainingTick(playerId, training, now);
    }
  }

  private runTrainingTick(
    playerId: string,
    training: ActiveTraining,
    now: number,
  ): void {
    const player = this.world.getPlayer(playerId);
    const session = this.registry.sessionFor(playerId);
    if (!player || !session) {
      this.active.delete(playerId);
      return;
    }
    const definition = getExerciseWeaponDefinition(training.weaponTypeId);
    if (!definition) {
      this.finish(
        playerId,
        session,
        "The selected item is not a training weapon, the training has stopped.",
      );
      return;
    }
    const dummy = this.dummyAt(training.dummyPosition);
    if (!dummy || dummy.typeId !== training.dummyTypeId) {
      this.finish(
        playerId,
        session,
        "Someone has moved the dummy, the training has stopped.",
      );
      return;
    }
    if (!this.world.isProtectionZone(player.position)) {
      this.finish(
        playerId,
        session,
        "You are no longer in a protection zone, the training has stopped.",
      );
      return;
    }

    // A faster tier shortens the interval and nothing else: the same tries per
    // hit against the same charge, simply landed more often. Premium accounts
    // swing 10% faster on top (VIP benefit), re-read every tick so a lapse
    // mid-session slows the pace immediately.
    const intervalMs = exerciseTrainingIntervalMs(
      player.progression.attackSpeedMs,
      this.speedRate *
        definition.speedMultiplier *
        (player.isPremiumAt(now)
          ? PREMIUM_BENEFITS.exerciseSpeedMultiplier
          : 1),
    );
    if (training.creditedHits > 0 && now >= training.nextAt) {
      training.creditedHits -= 1;
      this.drawTrainingHit(player, training, definition);
      // Scheduled from the last due time rather than from `now`, so an
      // interval shorter than the tick averages out instead of rounding up to
      // a whole tick. Clamped to `now` so a stall cannot bank a backlog to
      // repay in a burst.
      training.nextAt = Math.max(now, training.nextAt + intervalMs);
    }

    const weapon = this.items
      .inventorySnapshot(playerId)
      ?.items.find((candidate) => candidate.id === training.weaponItemId);
    if (!weapon || weapon.typeId !== training.weaponTypeId) {
      // Hits already paid for still land: the charges are spent either way,
      // and stopping mid-bundle would swallow the animation the player bought.
      if (training.creditedHits > 0) return;
      this.finish(
        playerId,
        session,
        training.spentOut
          ? "Your training weapon has disappeared."
          : "You need the training weapon in the backpack, the training has stopped.",
      );
      return;
    }
    if (training.writeStartedAt !== null) return;
    const available = chargesOf(
      weapon,
      this.catalog.require(weapon.typeId).charges,
    );
    if (available < 1) {
      if (training.creditedHits === 0) {
        this.finish(playerId, session, "Your training weapon has disappeared.");
      }
      return;
    }

    // Buy ahead by exactly the last write's round trip. One charge write is a
    // serializable transaction, so waiting for each one before drawing the
    // next hit caps the rate at the database's latency — half a second per hit
    // against a remote database, which is what made the fast tiers no faster
    // than the slow ones. A quick database measures ~0ms and falls back to one
    // charge per write, exactly as before.
    const dueOfNextUnpaid = training.nextAt + training.creditedHits * intervalMs;
    if (now + training.lastWriteMs < dueOfNextUnpaid) return;
    const wanted = Math.min(
      MAX_CHARGES_PER_WRITE,
      available,
      Math.max(1, Math.ceil(training.lastWriteMs / intervalMs)),
    );

    // An item write already in flight for this character would race the charge
    // decrement, so `consumeCharges` declines and this tick simply retries on
    // the next one rather than spending against a stale revision.
    training.writeStartedAt = now;
    const started = this.items.consumeCharges(
      session,
      weapon.id,
      weapon.version,
      wanted,
      (spent, committedAt) => {
        training.lastWriteMs = Math.max(0, committedAt - now);
        training.writeStartedAt = null;
        training.creditedHits += spent;
        training.spentOut ||= !this.items
          .inventorySnapshot(playerId)
          ?.items.some((candidate) => candidate.id === training.weaponItemId);
        this.awardTrainingHits(
          playerId,
          training,
          definition,
          dummy.rate,
          spent,
          committedAt,
        );
      },
    );
    if (!started) training.writeStartedAt = null;
  }

  /**
   * Credits the tries the committed charges bought. Awarded whole rather than
   * as each hit is drawn: the charges are already spent, so holding progress
   * back would let a logout mid-bundle lose tries the player paid for.
   */
  private awardTrainingHits(
    playerId: string,
    training: ActiveTraining,
    definition: ExerciseWeaponDefinition,
    dummyRate: number,
    hits: number,
    now: number,
  ): void {
    if (hits < 1) return;
    const gain = computeExerciseTrainingGain({
      target: definition.target,
      dummyRate,
    });
    const eventId = `exercise:${playerId}:${training.dummyPosition.x}:${training.dummyPosition.y}:${now}`;
    if (gain.skill) {
      this.progression.awardSkillTries(
        playerId,
        eventId,
        gain.skill,
        gain.skillTries * hits,
        now,
      );
    } else if (gain.magicManaSpent > 0) {
      this.progression.awardMagicProgress(
        playerId,
        eventId,
        gain.magicManaSpent * hits,
        now,
      );
    }
  }

  /** One paid-for hit landing on the dummy; decoration, never progress. */
  private drawTrainingHit(
    player: { readonly id: string; readonly position: Position },
    training: ActiveTraining,
    definition: ExerciseWeaponDefinition,
  ): void {
    this.visibility.broadcastMagicEffect(
      training.dummyPosition,
      definition.hitEffectId,
    );
    if (definition.missileId > 0) {
      this.visibility.broadcastDistanceMissile(
        player.position,
        training.dummyPosition,
        definition.missileId,
        MISSILE_DURATION_MS,
        [player.id],
      );
    }
  }

  private finish(playerId: string, session: Session, text: string): void {
    this.active.delete(playerId);
    this.say(session, text);
  }

  private say(session: Session, text: string): void {
    session.send({ type: "combat-log", kind: "condition", text });
  }

  private dummyAt(
    position: Position,
  ): { typeId: number; rate: number } | undefined {
    for (const item of this.world.getMapItems(position)) {
      const rate = getExerciseDummyRate(item.itemId);
      if (rate !== undefined) return { typeId: item.itemId, rate };
    }
    return undefined;
  }

  private dummyIsBusy(position: Position): boolean {
    let trainers = 0;
    for (const training of this.active.values()) {
      if (
        training.dummyPosition.x === position.x &&
        training.dummyPosition.y === position.y &&
        training.dummyPosition.z === position.z
      ) {
        trainers += 1;
      }
    }
    return trainers >= MAX_PLAYERS_PER_HOUSE_DUMMY;
  }

  private inReach(
    from: Position,
    target: Position,
    allowFarUse: boolean,
  ): boolean {
    if (isNear(from, target)) return true;
    if (!allowFarUse) return false;
    return (
      from.z === target.z &&
      Math.abs(target.x - from.x) <= FAR_USE_RANGE.x &&
      Math.abs(target.y - from.y) <= FAR_USE_RANGE.y &&
      this.world.hasLineOfSight(from, target)
    );
  }
}
