import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { Session } from "../Session";
import type { World } from "../World";
import { canPlayerTarget } from "./canPlayerTarget";
import { ChaseController } from "./ChaseController";
import { CombatFeedback } from "./CombatFeedback";
import type { CombatFormula } from "./CombatFormula";
import { DamageResolver } from "./DamageResolver";
import type { DamageResult } from "./Damage";
import { EventSequence } from "./EventSequence";
import { isInRange } from "./isInRange";
import { playerAttackPlan, type PlayerAttackPlan } from "./playerAttackPlan";
import { playerForSession } from "./playerForSession";
import type { PlayerSpecials } from "./playerSpecials";

export class PlayerAutoAttack {
  constructor(
    private readonly world: World,
    private readonly progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    private readonly formula: CombatFormula,
    private readonly feedback: CombatFeedback,
    private readonly sequence: EventSequence,
    private readonly damage: DamageResolver,
    private readonly chase: ChaseController,
  ) {}

  tickPlayerAttack(session: Session, now: number): void {
    const player = playerForSession(this.world, session);
    const target = session.attackTargetId
      ? this.world.getCreature(session.attackTargetId)
      : undefined;
    if (!player || !target) {
      if (session.attackTargetId) this.feedback.setTarget(session, null, now);
      return;
    }
    if (!canPlayerTarget(this.world, session, player, target)) {
      this.feedback.setTarget(session, null, now);
      return;
    }
    const plan = playerAttackPlan(
      this.items,
      this.formula,
      session,
      player,
      target,
    );
    if (!plan) {
      this.feedback.reject(session, now);
      this.feedback.setTarget(session, null, now);
      return;
    }
    if (
      !isInRange(player.position, target.position, plan.range) ||
      (plan.lineOfSight &&
        !this.world.hasLineOfSight(player.position, target.position))
    ) {
      this.chase.chaseTarget(session, player, target, now, plan.range);
      return;
    }
    if (now < player.nextAttackAt || session.itemOperationPending) return;
    if (plan.manaCost > 0 && !player.spendMana(plan.manaCost)) {
      this.feedback.reject(session, now);
      this.feedback.setTarget(session, null, now);
      return;
    }
    const attackPlan =
      plan.breakable && this.formula.chance(plan.breakable.chance)
        ? {
            ...plan,
            consume: {
              itemId: plan.breakable.itemId,
              revision: plan.breakable.revision,
              reason: "break" as const,
            },
          }
        : plan;
    player.nextAttackAt = now + player.progression.attackSpeedMs;
    this.feedback.setCooldown(
      session,
      "attack",
      player.progression.attackSpeedMs,
      now,
    );
    if (plan.manaCost > 0) {
      this.progression.awardMagicProgress(
        player.id,
        this.sequence.nextEventId(`wand:${player.id}`),
        plan.manaCost,
        now,
      );
    }
    if (attackPlan.consume) {
      this.items.consumeForCombat(
        session,
        attackPlan.consume.itemId,
        attackPlan.consume.revision,
        attackPlan.consume.reason,
        (committedAt) =>
          this.performPlayerAttack(session, attackPlan, committedAt),
      );
      return;
    }
    this.performPlayerAttack(session, attackPlan, now);
  }

  private performPlayerAttack(
    session: Session,
    plan: PlayerAttackPlan,
    now: number,
  ): void {
    const player = playerForSession(this.world, session);
    const target = this.world.getCreature(plan.targetId);
    if (
      !player ||
      !target ||
      !session.knownCreatureIds.has(target.id) ||
      !this.world.canSee(player.position, target.position, session.viewRange) ||
      !canPlayerTarget(this.world, session, player, target) ||
      !isInRange(player.position, target.position, plan.range) ||
      (plan.lineOfSight &&
        !this.world.hasLineOfSight(player.position, target.position))
    ) {
      this.feedback.reject(session, now);
      return;
    }
    let attackBlock: DamageResult["block"] = "none";
    let requests = plan.requests;
    let totalDamage = 0;
    if (plan.weaponRoll) {
      const request = requests[0];
      if (!request || !this.formula.chance(plan.weaponRoll.hitChance)) {
        if (request) this.damage.publishDamageResult(target, request, 0, "miss");
        attackBlock = "miss";
      } else {
        let total = this.formula.normalInteger(
          plan.weaponRoll.minimum,
          plan.weaponRoll.maximum,
        );
        if (this.formula.chance(plan.weaponRoll.specials.criticalChance)) {
          total = Math.floor(
            total *
              (1 +
                plan.weaponRoll.specials.criticalDamagePercent /
                  100),
          );
        }
        requests = requests.map((entry, index) => {
          const amount = Math.max(
            0,
            Math.floor(total * (plan.weaponRoll?.shares[index] ?? 0)),
          );
          return {
            ...entry,
            minimum: amount,
            maximum: amount,
            hitChance: undefined,
          };
        });
      }
    }
    let first = true;
    if (attackBlock !== "miss") {
      for (const request of requests) {
        const result = this.damage.applyDamage(target, request, now);
        totalDamage += result.amount;
        if (first) attackBlock = result.block;
        first = false;
        if (result.block === "miss") break;
        if (target.health <= 0) break;
      }
    }
    if (plan.weaponRoll && totalDamage > 0) {
      this.applyPlayerLeech(
        player,
        totalDamage,
        plan.weaponRoll.specials,
        now,
      );
    }
    if (plan.training) {
      player.recordAttackBlock(attackBlock);
      const tries = player.attackSkillTries(
        plan.training.kind,
        attackBlock,
      );
      if (tries > 0) {
        this.progression.awardSkillTries(
          player.id,
          this.sequence.nextEventId(`attack:${player.id}`),
          plan.training.skill,
          tries,
          now,
        );
      }
    }
    this.feedback.sendFightState(session, now);
  }

  private applyPlayerLeech(
    player: Player,
    damage: number,
    specials: PlayerSpecials,
    now: number,
  ): void {
    const health = Math.round(
      damage *
        (this.formula.chance(specials.lifeLeechChance)
          ? specials.lifeLeechPercent
          : 0) /
        100,
    );
    const mana = Math.round(
      damage *
        (this.formula.chance(specials.manaLeechChance)
          ? specials.manaLeechPercent
          : 0) /
        100,
    );
    if (health > 0) player.setHealth(player.health + health);
    if (mana > 0) player.restoreMana(mana);
    if (health > 0 || mana > 0) {
      this.progression.syncPlayer(player, now);
    }
  }
}
