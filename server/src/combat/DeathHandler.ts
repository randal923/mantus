import { randomUUID } from "node:crypto";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { CombatFeedback } from "./CombatFeedback";
import type { CombatFormula } from "./CombatFormula";
import { createMonsterCorpse } from "./createMonsterCorpse";

const PLAYER_DEATH_INVULNERABILITY_MS = 2_000;

export class DeathHandler {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    private readonly progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    private readonly formula: CombatFormula,
    private readonly feedback: CombatFeedback,
    private readonly onMonsterDeath: (monster: Monster, now: number) => boolean,
  ) {}

  handleDeath(
    target: Creature,
    sourceId: string | null,
    now: number,
  ): void {
    if (!target.claimDeath()) return;
    // Unique per life/death transition: monster ids repeat across respawns
    // and server restarts, so they cannot key persisted progression events.
    const deathEventId = `death:${randomUUID()}`;
    if (target instanceof Monster) {
      const killerId =
        (sourceId && this.world.getPlayer(sourceId)?.id) ??
        target.topDamagerId();
      if (killerId && target.type.experience > 0) {
        this.progression.awardExperience(
          killerId,
          deathEventId,
          target.type.experience,
          now,
        );
        this.registry.sessionFor(killerId)?.send({
          type: "combat-log",
          kind: "experience",
          text: `You gained ${target.type.experience} experience.`,
        });
      }
      createMonsterCorpse(
        this.world,
        this.items,
        this.formula,
        target,
        killerId,
        deathEventId,
      );
      if (!this.onMonsterDeath(target, now)) {
        this.world.removeCreature(target.id);
        this.visibility.announceCreatureLeave(target);
      }
      return;
    }
    if (!(target instanceof Player)) return;
    const session = this.registry.sessionFor(target.id);
    target.conditions.clear();
    const penalty = target.applyDeathPenalty(deathEventId);
    target.restoreAfterDeath();
    target.invulnerableUntil = now + PLAYER_DEATH_INVULNERABILITY_MS;
    target.nextAttackAt = target.invulnerableUntil;
    const spawn = this.world.findSpawn(this.world.templePosition);
    if (spawn) {
      const from = this.world.relocateCreature(target, spawn);
      if (session) {
        session.movementDirection = null;
        session.bufferedMovementDirection = null;
        session.attackTargetId = null;
        session.combatCooldowns.clear();
        this.visibility.onPlayerStepped(session, target, from, 0);
      }
    }
    for (const other of this.registry.all()) {
      if (other.attackTargetId !== target.id) continue;
      other.attackTargetId = null;
      other.send({ type: "attack-target-changed", creatureId: null });
      this.feedback.sendFightState(other, now);
    }
    this.progression.syncPlayer(target, now, true);
    const inventory = this.items.updateCapacity(target.id, target.capacity);
    if (inventory && session) {
      session.send({ type: "inventory-updated", inventory });
    }
    this.visibility.broadcastHealth(target);
    this.visibility.onCreatureStateChanged(target);
    session?.send({
      type: "combat-log",
      kind: "death",
      text: "You died and returned to the temple.",
    });
    if (penalty.lostExperience > 0) {
      session?.send({
        type: "combat-log",
        kind: "experience",
        text: `You lost ${penalty.lostExperience} experience.`,
      });
    }
    if (session) this.feedback.sendFightState(session, now);
  }
}
