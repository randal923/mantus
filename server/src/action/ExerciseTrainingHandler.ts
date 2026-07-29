import type { Position, UseItemWithMessage } from "@tibia/protocol";
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
/** CONST_ME_HITAREA, the puff Canary draws on the dummy every tick. */
const HIT_EFFECT_ID = 10;
/** Canary allowFarUse still requires the same floor and line of sight. */
const FAR_USE_RANGE = { x: 7, y: 5 } as const;

interface ActiveTraining {
  readonly weaponItemId: string;
  readonly weaponTypeId: number;
  readonly dummyPosition: Position;
  readonly dummyTypeId: number;
  nextAt: number;
}

/**
 * Exercise-weapon training, ported from Canary's
 * `data/scripts/actions/items/exercise_training_weapons.lua`.
 *
 * Every rule is re-checked on the tick that awards, not when the intent
 * arrived (charter rule 4): the dummy must still be on its tile, the trainer
 * must still stand in a protection zone, and the weapon must still be carried
 * at the revision the charge is spent against. The charge is spent by a single
 * atomic store operation and the skill is awarded only once that commits, so a
 * failed write can never hand out free progress.
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
      if (now < training.nextAt) continue;
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
    const weapon = this.items
      .inventorySnapshot(playerId)
      ?.items.find((candidate) => candidate.id === training.weaponItemId);
    if (!weapon || weapon.typeId !== training.weaponTypeId) {
      this.finish(
        playerId,
        session,
        "You need the training weapon in the backpack, the training has stopped.",
      );
      return;
    }
    const definition = getExerciseWeaponDefinition(weapon.typeId);
    if (!definition) {
      this.finish(
        playerId,
        session,
        "The selected item is not a training weapon, the training has stopped.",
      );
      return;
    }
    const remaining =
      chargesOf(weapon, this.catalog.require(weapon.typeId).charges) - 1;
    if (remaining < 0) {
      this.finish(
        playerId,
        session,
        "Your training weapon has disappeared.",
      );
      return;
    }
    // An item write already in flight for this character would race the charge
    // decrement, so `consumeCharge` declines and this tick simply retries on
    // the next one rather than spending against a stale revision.
    const started = this.items.consumeCharge(
      session,
      weapon.id,
      weapon.version,
      (committedAt) =>
        this.awardTrainingTick(playerId, training, definition, dummy.rate, committedAt),
    );
    if (!started) return;
    training.nextAt =
      now + exerciseTrainingIntervalMs(player.progression.attackSpeedMs, this.speedRate);
    if (remaining === 0) {
      this.finish(playerId, session, "Your training weapon has disappeared.");
    }
  }

  private awardTrainingTick(
    playerId: string,
    training: ActiveTraining,
    definition: ExerciseWeaponDefinition,
    dummyRate: number,
    now: number,
  ): void {
    const player = this.world.getPlayer(playerId);
    if (!player) return;
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
        gain.skillTries,
        now,
      );
    } else if (gain.magicManaSpent > 0) {
      this.progression.awardMagicProgress(
        playerId,
        eventId,
        gain.magicManaSpent,
        now,
      );
    }
    this.visibility.broadcastMagicEffect(training.dummyPosition, HIT_EFFECT_ID);
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
