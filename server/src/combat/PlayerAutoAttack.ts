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
import type { ProficiencyHooks } from "../proficiency/ProficiencyHooks";
import type { PvpHooks } from "../pvp/PvpHooks";

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
    private readonly pvpHooks?: PvpHooks,
    private readonly proficiencyHooks?: ProficiencyHooks,
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
    if (!canPlayerTarget(this.world, session, player, target, this.pvpHooks)) {
      this.feedback.setTarget(session, null, now);
      return;
    }
    const plan = playerAttackPlan(
      this.items,
      this.formula,
      session,
      player,
      target,
      this.proficiencyHooks?.effectsFor(player.id),
      now,
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
      this.chase.chaseTarget(
        session,
        player,
        target,
        now,
        plan.range,
        session.huntingBotEnabled,
      );
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
      !canPlayerTarget(this.world, session, player, target, this.pvpHooks) ||
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
    let criticalHit = false;
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
          criticalHit = true;
          total = Math.floor(
            total *
              (1 +
                plan.weaponRoll.specials.criticalDamagePercent /
                  100),
          );
        }
        // Proficiency skill-percentage flat damage joins the roll before
        // the multiplicative procs.
        total += plan.weaponRoll.flatBonusDamage;
        // Weapon-tier onslaught: +60% damage on proc, composing after the
        // critical exactly like Canary combat.cpp:2597-2601.
        if (this.formula.chance(plan.weaponRoll.fatalChancePercent)) {
          total += Math.round(total * 0.6);
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
    // The weapon-roll crit multiplies before the requests split the total,
    // so the resolver never sees it — show the burst from here.
    if (criticalHit && totalDamage > 0) {
      this.damage.broadcastCriticalEffect(target);
    }
    if (plan.weaponRoll && totalDamage > 0) {
      this.applyPlayerLeech(
        player,
        totalDamage,
        plan.weaponRoll.specials,
        now,
        plan.weaponRoll.proficiencyLifeLeechPercent,
        plan.weaponRoll.proficiencyManaLeechPercent,
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
    proficiencyLifePercent = 0,
    proficiencyManaPercent = 0,
  ): void {
    // Equipment leech keeps its chance roll; wheel, gem, and imbuement
    // leech always apply (Canary folds WheelStat_t and imbuement leech into
    // the leech skills, player.cpp:7360-7363, and never rolls the vestigial
    // imbuement chance — game.cpp:8983). Single-target, so no falloff.
    const wheel = player.wheelBonuses;
    const imbuements = this.items.imbuementEffects(player.id);
    const affixes = this.items.affixEffects(player.id);
    const lifePercent =
      (this.formula.chance(specials.lifeLeechChance)
        ? specials.lifeLeechPercent
        : 0) +
      wheel.lifeLeechPercent +
      imbuements.lifeLeechPercent +
      affixes.lifeLeechPercent +
      proficiencyLifePercent;
    const manaPercent =
      (this.formula.chance(specials.manaLeechChance)
        ? specials.manaLeechPercent
        : 0) +
      wheel.manaLeechPercent +
      imbuements.manaLeechPercent +
      affixes.manaLeechPercent +
      proficiencyManaPercent;
    const health = Math.min(
      damage,
      Math.max(0, Math.round((damage * lifePercent) / 100)),
    );
    const mana = Math.min(
      damage,
      Math.max(0, Math.round((damage * manaPercent) / 100)),
    );
    if (health > 0) player.setHealth(player.health + health);
    if (mana > 0) player.restoreMana(mana);
    if (health > 0 || mana > 0) {
      this.progression.syncPlayer(player, now);
    }
  }
}
