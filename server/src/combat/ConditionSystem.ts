import type { ConditionType } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import { Player } from "../Player";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { CombatFeedback } from "./CombatFeedback";
import type { ConditionApplication } from "./Condition";
import { DamageResolver } from "./DamageResolver";

export class ConditionSystem {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    private readonly feedback: CombatFeedback,
    private readonly damage: DamageResolver,
    /** Vibrancy roll source; wired by Combat after construction. */
    private vibrancy?: {
      paralysisRemoveChancePercent(characterId: string): number;
      pvpDeflect(characterId: string): boolean;
      roll(percent: number): boolean;
    },
  ) {}

  setVibrancyHook(hook: {
    paralysisRemoveChancePercent(characterId: string): number;
    pvpDeflect(characterId: string): boolean;
    roll(percent: number): boolean;
  }): void {
    this.vibrancy = hook;
  }

  applyCondition(
    target: Creature,
    application: ConditionApplication,
    now: number,
  ): boolean {
    if (
      target instanceof Monster &&
      target.type.immunities.includes(application.type)
    ) {
      this.visibility.broadcastMagicEffect(target.position, 4, target.id);
      return false;
    }
    // Feet-slot vibrancy (Canary condition.cpp:96-136): the deflect leg
    // clones player-cast paralysis onto a non-vibrant player attacker
    // (ownerless, so it cannot ping-pong) and the vibrant target never
    // receives it even when the removal roll fails; the removal roll also
    // strips any paralysis already running.
    if (
      application.type === "paralyze" &&
      target instanceof Player &&
      this.vibrancy
    ) {
      const attacker = application.sourceId
        ? this.world.getPlayer(application.sourceId)
        : undefined;
      const targetDeflects = this.vibrancy.pvpDeflect(target.id);
      if (targetDeflects && attacker && !this.vibrancy.pvpDeflect(attacker.id)) {
        this.applyCondition(attacker, { ...application, sourceId: null }, now);
      }
      if (
        this.vibrancy.roll(
          this.vibrancy.paralysisRemoveChancePercent(target.id),
        )
      ) {
        this.removeCondition(target, "paralyze", now);
        this.registry.sessionFor(target.id)?.send({
          type: "combat-log",
          kind: "condition",
          text: "You are unparalyzed by vibrancy.",
        });
        return false;
      }
      if (targetDeflects && attacker) return false;
    }
    target.conditions.apply(application, now);
    if (application.effectId) {
      this.visibility.broadcastMagicEffect(
        target.position,
        application.effectId,
        target.id,
      );
    }
    if (this.changesCreatureState(application.type)) {
      this.visibility.onCreatureStateChanged(target);
    }
    if (target instanceof Player) {
      this.feedback.sendFightStateForPlayer(target.id, now);
      this.registry.sessionFor(target.id)?.send({
        type: "combat-log",
        kind: "condition",
        text: `${application.type} applied.`,
      });
    }
    return true;
  }

  tick(now: number): void {
    // Snapshot only the creatures that need work: applyDamage below can kill
    // and remove creatures, so the processing loop must not walk the live map.
    let active: Creature[] | null = null;
    for (const creature of this.world.allCreatures()) {
      if (creature.conditions.isActive) (active ??= []).push(creature);
    }
    if (!active) return;
    for (const creature of active) {
      const result = creature.conditions.tick(now);
      for (const effect of result.effects) {
        this.damage.applyDamage(
          creature,
          {
            sourceId: effect.sourceId,
            origin: "condition",
            type: effect.damageType,
            minimum: effect.amount,
            maximum: effect.amount,
            ...(effect.effectId ? { effectId: effect.effectId } : {}),
            ignoreArmor: true,
            ignoreShield: true,
          },
          now,
        );
        if (creature.health <= 0) break;
      }
      if (!result.changed) continue;
      if (result.expiredTypes.some((type) => this.changesCreatureState(type))) {
        this.visibility.onCreatureStateChanged(creature);
      }
      if (creature instanceof Player) {
        this.feedback.sendFightStateForPlayer(creature.id, now);
      }
    }
  }

  removeCondition(
    target: Creature,
    type: ConditionType,
    now: number,
  ): boolean {
    if (!target.conditions.remove(type)) return false;
    if (this.changesCreatureState(type)) {
      this.visibility.onCreatureStateChanged(target);
    }
    if (target instanceof Player) {
      this.feedback.sendFightStateForPlayer(target.id, now);
    }
    return true;
  }

  private changesCreatureState(type: ConditionType): boolean {
    return type === "invisible" || type === "light" || type === "outfit";
  }
}
