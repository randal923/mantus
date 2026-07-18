import type { CombatTarget } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { applySpellCooldowns } from "./applySpellCooldowns";
import { canPlayerHarm } from "./canPlayerHarm";
import { CombatFeedback } from "./CombatFeedback";
import { MISSILE_DURATION_MS } from "./combatConstants";
import { ConditionSystem } from "./ConditionSystem";
import { creaturesInArea } from "./creaturesInArea";
import { DamageResolver } from "./DamageResolver";
import { EventSequence } from "./EventSequence";
import { evaluateSpellExpression } from "./evaluateSpellExpression";
import { isInRange } from "./isInRange";
import { matchesSpellTarget } from "./matchesSpellTarget";
import { playerCombatSkill } from "./playerCombatSkill";
import { playerForSession } from "./playerForSession";
import { playerMagicLevel } from "./playerMagicLevel";
import { playerSpecials } from "./playerSpecials";
import { resolveSpellTarget } from "./resolveSpellTarget";
import { skillForWeapon } from "./skillForWeapon";
import type { SpellDefinition } from "./Spell";
import { spellCondition } from "./spellCondition";

export class SpellCaster {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    private readonly feedback: CombatFeedback,
    private readonly sequence: EventSequence,
    private readonly damage: DamageResolver,
    private readonly conditions: ConditionSystem,
  ) {}

  executeSpell(
    session: Session,
    spell: SpellDefinition,
    targetIntent: CombatTarget,
    now: number,
    spendResources: boolean,
  ): void {
    const player = playerForSession(this.world, session);
    if (
      !player ||
      !this.canBeginSpell(session, player, spell, targetIntent, now)
    ) {
      this.feedback.reject(session, now);
      return;
    }
    const target = resolveSpellTarget(
      this.world,
      session,
      player,
      targetIntent,
    );
    if (!target) {
      this.feedback.reject(session, now);
      return;
    }
    if (spendResources) {
      if (!player.spendMana(spell.manaCost)) {
        this.feedback.reject(session, now);
        return;
      }
      if (!player.spendSoul(spell.soulCost)) {
        player.restoreMana(spell.manaCost);
        this.feedback.reject(session, now);
        return;
      }
    }
    applySpellCooldowns(this.feedback, session, spell, now);
    if (spendResources && spell.manaCost > 0) {
      this.progression.awardMagicProgress(
        player.id,
        this.sequence.nextEventId(`magic:${player.id}`),
        spell.manaCost,
        now,
      );
    } else if (spendResources && spell.soulCost > 0) {
      this.progression.syncPlayer(player, now, true);
    }
    if (spell.missileId && target.creature) {
      this.visibility.broadcastDistanceMissile(
        player.position,
        target.position,
        spell.missileId,
        MISSILE_DURATION_MS,
        [player.id, target.creature.id],
      );
    }
    const equipment = this.items.combatEquipment(player.id);
    const weapon = equipment.find(
      (entry) =>
        entry.item.location.kind === "equipment" &&
        entry.item.location.slot === "weapon",
    );
    const ammunition = equipment.find(
      (entry) =>
        entry.item.location.kind === "equipment" &&
        entry.item.location.slot === "ammo",
    );
    const variables = {
      level: player.level,
      magicLevel: playerMagicLevel(player, equipment),
      skill: playerCombatSkill(
        player,
        equipment,
        skillForWeapon(weapon?.type.weaponType),
      ),
      attack:
        (weapon?.type.attack ?? 7) +
        (weapon?.type.weaponType === "distance"
          ? (ammunition?.type.attack ?? 0)
          : 0),
    };
    const minimum = Math.max(
      0,
      Math.floor(
        Math.abs(
          evaluateSpellExpression(spell.formula.minimum, variables),
        ),
      ),
    );
    const maximum = Math.max(
      minimum,
      Math.floor(
        Math.abs(
          evaluateSpellExpression(spell.formula.maximum, variables),
        ),
      ),
    );
    const affected = creaturesInArea(
      this.world,
      player.position,
      target.position,
      spell.area,
    );
    if (spell.area.shape === "single" && target.creature && affected.length === 0) {
      affected.push(target.creature);
    }
    const specials = playerSpecials(equipment);
    if (maximum > 0) {
      for (const creature of affected) {
        if (
          spell.damageType !== "healing" &&
          !canPlayerHarm(this.world, session, player, creature)
        ) {
          continue;
        }
        this.damage.applyDamage(
          creature,
          {
            sourceId: player.id,
            origin: spell.origin,
            type: spell.damageType,
            minimum,
            maximum,
            effectId: spell.effectId,
            ignoreArmor: !spell.blockArmor,
            ignoreShield: !spell.blockShield,
            ...specials,
          },
          now,
        );
      }
    } else {
      this.visibility.broadcastMagicEffect(
        target.position,
        spell.effectId,
        target.creature?.id,
      );
    }
    if (spell.condition) {
      for (const creature of affected.length > 0 ? affected : [player]) {
        if (
          spell.damageType !== "healing" &&
          !canPlayerHarm(this.world, session, player, creature)
        ) {
          continue;
        }
        const condition = spellCondition(
          player,
          creature,
          spell,
          variables.magicLevel,
        );
        if (condition) this.conditions.applyCondition(creature, condition, now);
      }
    }
    if (spell.casterEffectId > 0) {
      this.visibility.broadcastMagicEffect(
        player.position,
        spell.casterEffectId,
        player.id,
      );
    }
    if (spell.castRules?.casterEffectId) {
      this.visibility.broadcastMagicEffect(
        player.position,
        spell.castRules.casterEffectId,
        player.id,
      );
    }
    if (spell.dispel) {
      for (const creature of affected.length > 0 ? affected : [player]) {
        if (!creature.conditions.remove(spell.dispel)) continue;
        this.visibility.onCreatureStateChanged(creature);
        if (creature instanceof Player) {
          this.feedback.sendFightStateForPlayer(creature.id, now);
        }
      }
    }
    this.feedback.sendFightState(session, now);
  }

  executeConjure(
    session: Session,
    spell: SpellDefinition,
    targetIntent: CombatTarget,
    now: number,
  ): void {
    const player = playerForSession(this.world, session);
    const conjure = spell.conjure;
    if (
      !player ||
      !conjure ||
      !this.canBeginSpell(session, player, spell, targetIntent, now)
    ) {
      this.feedback.reject(session, now);
      return;
    }
    const expectedMana = player.mana;
    const expectedSoul = player.progression.soul;
    const expectedVersion = this.persistence.beginExternalMutation(
      player,
      now,
    );
    this.items.conjureForCombat(
      session,
      expectedVersion,
      expectedMana,
      expectedSoul,
      spell.manaCost,
      spell.soulCost,
      conjure.sourceItemTypeId,
      conjure.targetItemTypeId,
      conjure.count,
      (version, characterVersion, committedAt) => {
        this.persistence.completeExternalMutation(
          player,
          version,
          characterVersion,
        );
        const spentMana = player.spendMana(spell.manaCost);
        const spentSoul = player.spendSoul(spell.soulCost);
        if (!spentMana || !spentSoul) {
          throw new Error("committed conjuring resources diverged");
        }
        applySpellCooldowns(this.feedback, session, spell, committedAt);
        if (spell.manaCost > 0) {
          this.progression.awardMagicProgress(
            player.id,
            this.sequence.nextEventId(`magic:${player.id}`),
            spell.manaCost,
            committedAt,
          );
        } else {
          this.progression.syncPlayer(player, committedAt, true);
        }
        if (spell.effectId > 0) {
          this.visibility.broadcastMagicEffect(
            player.position,
            spell.effectId,
            player.id,
          );
        }
        this.feedback.sendFightState(session, committedAt);
      },
      (failedAt) => {
        this.persistence.cancelExternalMutation(player);
        this.persistence.saveNow(player, failedAt);
      },
    );
  }

  canBeginSpell(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    target: CombatTarget,
    now: number,
  ): boolean {
    const equipment = this.items.combatEquipment(player.id);
    if (
      session.itemOperationPending ||
      player.conditions.has("mute") ||
      !spell.vocations.includes(player.vocation) ||
      player.level < spell.requiredLevel ||
      playerMagicLevel(player, equipment) <
        spell.requiredMagicLevel ||
      player.mana < spell.manaCost ||
      player.progression.soul < spell.soulCost ||
      !matchesSpellTarget(spell, target) ||
      (session.combatCooldowns.get(`spell:${spell.id}`)?.readyAt ?? 0) > now ||
      spell.groups.some(
        (group) =>
          (session.combatCooldowns.get(`group:${group}`)?.readyAt ?? 0) > now,
      ) ||
      (spell.needWeapon &&
        !equipment.some(
          (entry) =>
            entry.item.location.kind === "equipment" &&
            entry.item.location.slot === "weapon" &&
            entry.type.weaponType !== undefined &&
            entry.type.weaponType !== "shield",
        ))
    ) {
      return false;
    }
    const resolved = resolveSpellTarget(this.world, session, player, target);
    if (!resolved) return false;
    if (
      spell.castRules &&
      (spell.castRules.excludedVocations.includes(player.vocation) ||
        (spell.castRules.targetPlayerOnly &&
          !(resolved.creature instanceof Player)) ||
        (!spell.castRules.allowSelf && resolved.creature === player))
    ) {
      return false;
    }
    const harmful = spell.damageType !== "healing";
    if (
      harmful &&
      (this.world.isProtectionZone(player.position) ||
        this.world.isProtectionZone(resolved.position))
    ) {
      return false;
    }
    if (
      harmful &&
      resolved.creature &&
      !canPlayerHarm(this.world, session, player, resolved.creature)
    ) {
      return false;
    }
    return (
      (target.kind === "direction" ||
        isInRange(player.position, resolved.position, spell.range)) &&
      (!spell.lineOfSight ||
        this.world.hasLineOfSight(player.position, resolved.position))
    );
  }
}
