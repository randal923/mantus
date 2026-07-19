import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PartyHooks } from "../party/PartyHooks";
import { Player } from "../Player";
import { getVocation } from "../progression/getVocation";
import type { PvpHooks } from "../pvp/PvpHooks";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { applyCombatLocks } from "./applyCombatLocks";
import { catalogDamageType } from "./catalogDamageType";
import { CombatFeedback } from "./CombatFeedback";
import { MISSILE_DURATION_MS } from "./combatConstants";
import type { CombatFormula } from "./CombatFormula";
import type { DamageRequest, DamageResult } from "./Damage";
import { DeathHandler } from "./DeathHandler";
import { EventSequence } from "./EventSequence";
import { playerDefense } from "./playerDefense";

export class DamageResolver {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    private readonly progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    private readonly formula: CombatFormula,
    private readonly feedback: CombatFeedback,
    private readonly sequence: EventSequence,
    private readonly death: DeathHandler,
    private readonly partyHooks?: PartyHooks,
    private readonly pvpHooks?: PvpHooks,
  ) {}

  applyDamage(
    target: Creature,
    request: DamageRequest,
    now: number,
  ): DamageResult {
    if (
      target.health <= 0 ||
      (target instanceof Player &&
        (now < target.invulnerableUntil ||
          this.registry.sessionFor(target.id)?.travelOperationPending))
    ) {
      return {
        amount: 0,
        block: "immunity",
        critical: false,
        healthChanged: false,
        manaChanged: false,
      };
    }
    // PVP consequences are applied at damage execution, before the roll:
    // aggression (yellow mark, white skull, in-fight) registers even on a
    // miss, and a black-skulled attacker's damage against an unmarked
    // player is dropped outright.
    const pvpSource = request.sourceId
      ? this.world.getCreature(request.sourceId)
      : undefined;
    if (
      this.pvpHooks &&
      pvpSource instanceof Player &&
      target instanceof Player &&
      pvpSource.id !== target.id &&
      request.type !== "healing" &&
      this.pvpHooks.onPlayerAttack(pvpSource, target, now) === "blocked"
    ) {
      return {
        amount: 0,
        block: "immunity",
        critical: false,
        healthChanged: false,
        manaChanged: false,
      };
    }
    if (
      request.hitChance !== undefined &&
      !this.formula.chance(request.hitChance)
    ) {
      this.publishDamageResult(target, request, 0, "miss");
      return {
        amount: 0,
        block: "miss",
        critical: false,
        healthChanged: false,
        manaChanged: false,
      };
    }
    let amount = this.formula.normalInteger(
      request.minimum,
      request.maximum,
    );
    const critical = this.formula.chance(request.criticalChance ?? 0);
    if (critical) {
      amount = Math.floor(
        amount * (1 + (request.criticalDamagePercent ?? 50) / 100),
      );
    }
    const source = request.sourceId
      ? this.world.getCreature(request.sourceId)
      : undefined;
    if (
      source instanceof Player &&
      target instanceof Player &&
      request.type !== "healing"
    ) {
      amount = Math.round(amount / 2);
    }
    if (request.type === "healing") {
      const before = target.health;
      target.setHealth(target.health + amount);
      const healed = target.health - before;
      this.publishDamageResult(target, request, healed, "none");
      if (target instanceof Player && healed > 0) {
        this.progression.syncPlayer(target, now);
        if (source instanceof Player) {
          this.partyHooks?.recordPartnerHeal(source.id, target.id, now);
        }
      }
      return {
        amount: healed,
        block: "none",
        critical,
        healthChanged: healed > 0,
        manaChanged: false,
      };
    }
    const mitigated = this.mitigate(target, request, amount, now);
    amount = mitigated.amount;
    let manaChanged = false;
    let healthChanged = false;
    if (request.type === "mana-drain") {
      if (target instanceof Player) {
        const drained = Math.min(target.mana, amount);
        manaChanged = drained > 0 && target.spendMana(drained);
        amount = drained;
      } else {
        amount = 0;
      }
    } else {
      if (target instanceof Player && target.conditions.has("magic-shield")) {
        const absorbed = target.conditions.absorbMagicShield(
          Math.min(target.mana, amount),
        );
        if (absorbed > 0) {
          target.spendMana(absorbed);
          if (target.mana === 0) {
            target.conditions.remove("magic-shield");
          }
          manaChanged = true;
          amount -= absorbed;
          this.visibility.onCreatureStateChanged(target);
          this.feedback.sendFightStateForPlayer(target.id, now);
        }
      }
      if (amount > 0) {
        const before = target.health;
        target.setHealth(target.health - amount);
        amount = before - target.health;
        healthChanged = amount > 0;
      }
    }
    this.publishDamageResult(target, request, amount, mitigated.block);
    if (target instanceof Monster && source instanceof Player && amount > 0) {
      target.recordPlayerDamage(source.id, amount);
      this.partyHooks?.recordMonsterDamage(source.id, now);
    }
    if (target instanceof Player && (healthChanged || manaChanged)) {
      if (source instanceof Player && healthChanged) {
        this.pvpHooks?.recordDamageTaken(target, source.id, amount, now);
      }
      this.progression.syncPlayer(target, now);
      // Canary parity: the victim gets in-fight but never a pz-lock —
      // only the aggressor is protection-zone locked (leg below).
      applyCombatLocks(
        this.feedback,
        target,
        source?.id ?? null,
        false,
        now,
      );
    }
    if (source instanceof Player && amount > 0) {
      const healthLeech = Math.round(
        amount *
          (this.formula.chance(request.lifeLeechChance ?? 0)
            ? (request.lifeLeechPercent ?? 0)
            : 0) /
          100,
      );
      const manaLeech = Math.round(
        amount *
          (this.formula.chance(request.manaLeechChance ?? 0)
            ? (request.manaLeechPercent ?? 0)
            : 0) /
          100,
      );
      if (healthLeech > 0) source.setHealth(source.health + healthLeech);
      if (manaLeech > 0) source.restoreMana(manaLeech);
      applyCombatLocks(
        this.feedback,
        source,
        target.id,
        target instanceof Player,
        now,
      );
      if (healthLeech > 0 || manaLeech > 0) {
        this.progression.syncPlayer(source, now);
      }
    }
    if (healthChanged && target.health <= 0) {
      this.death.handleDeath(target, request.sourceId, now);
    }
    return {
      amount,
      block: mitigated.block,
      critical,
      healthChanged,
      manaChanged,
    };
  }

  publishDamageResult(
    target: Creature,
    request: DamageRequest,
    amount: number,
    block: DamageResult["block"],
  ): void {
    if (request.missileId && request.sourceId) {
      const source = this.world.getCreature(request.sourceId);
      if (source) {
        this.visibility.broadcastDistanceMissile(
          source.position,
          target.position,
          request.missileId,
          MISSILE_DURATION_MS,
          [source.id, target.id],
        );
      }
    }
    if (request.effectId) {
      this.visibility.broadcastMagicEffect(
        target.position,
        request.effectId,
        target.id,
      );
    }
    this.visibility.broadcastCombatText(
      target,
      amount,
      request.type,
      block,
    );
    this.visibility.broadcastHealth(target);
    const sourceSession = request.sourceId
      ? this.registry.sessionFor(request.sourceId)
      : undefined;
    if (sourceSession) {
      sourceSession.send({
        type: "combat-log",
        kind:
          block === "miss"
            ? "miss"
            : request.type === "healing"
              ? "healing"
              : "damage",
        text:
          block === "miss"
            ? `You missed ${target.name}.`
            : `${target.name}: ${amount} ${request.type}.`,
      });
    }
  }

  private mitigate(
    target: Creature,
    request: DamageRequest,
    rawAmount: number,
    now: number,
  ): { amount: number; block: DamageResult["block"] } {
    let amount = rawAmount;
    let block: DamageResult["block"] = "none";
    if (target instanceof Monster) {
      const resistance = target.type.elements[request.type] ?? 0;
      if (resistance >= 100) return { amount: 0, block: "immunity" };
      const stats = target.type.defenses.find(
        (ability) => ability.kind === "stats",
      );
      amount = this.formula.applyAbsorbPercent(amount, resistance);
      const checksPhysical =
        request.type === "physical" &&
        (!request.ignoreShield || !request.ignoreArmor);
      const usedDefenseBlock =
        checksPhysical && target.consumeDefenseBlock(now);
      if (request.type === "physical") {
        if (
          !request.ignoreShield &&
          usedDefenseBlock &&
          (stats?.defense ?? 0) > 0
        ) {
          amount -= this.formula.defenseReduction(stats?.defense ?? 0);
          if (amount <= 0) {
            amount = 0;
            block = "shield";
          }
        }
        if (!request.ignoreArmor && amount > 0 && (stats?.armor ?? 0) > 0) {
          amount -= this.formula.armorReduction(stats?.armor ?? 0);
          if (amount <= 0) {
            amount = 0;
            block = "armor";
          }
        }
      }
      if (
        request.type !== "life-drain" &&
        request.type !== "mana-drain" &&
        amount > 0
      ) {
        amount = Math.max(
          0,
          Math.floor(amount * (1 - (stats?.mitigation ?? 0) / 100)),
        );
        if (amount === 0) block = "armor";
      }
      return { amount: Math.max(0, amount), block };
    }
    if (target instanceof Player) {
      const equipment = this.items.combatEquipment(target.id);
      const absorbType = catalogDamageType(request.type);
      const absorb = equipment.reduce(
        (total, entry) =>
          total + (entry.type.absorbPercent?.[absorbType] ?? 0),
        0,
      );
      if (absorb >= 100) return { amount: 0, block: "immunity" };
      amount = this.formula.applyAbsorbPercent(amount, absorb);
      if (request.type === "physical") {
        const session = this.registry.sessionFor(target.id);
        const shield = equipment.find(
          (entry) =>
            entry.item.location.kind === "equipment" &&
            entry.item.location.slot === "shield",
        );
        const checksPhysical =
          !request.ignoreShield || !request.ignoreArmor;
        const usedDefenseBlock =
          checksPhysical && target.consumeDefenseBlock(now);
        if (!request.ignoreShield && usedDefenseBlock) {
          amount -= this.formula.defenseReduction(
            playerDefense(
              target,
              equipment,
              session?.fightMode.attack ?? "offensive",
              now,
            ),
          );
          if (amount <= 0) {
            amount = 0;
            block = "shield";
          }
        }
        const vocation = getVocation(
          target.vocation,
          target.progression.definitionVersion,
        );
        const armor = Math.floor(
          equipment.reduce(
            (total, entry) =>
              entry.item.location.kind === "equipment" &&
              [
                "helmet",
                "amulet",
                "armor",
                "legs",
                "boots",
                "ring",
                "ammo",
              ].includes(entry.item.location.slot)
                ? total + (entry.type.armor ?? 0)
                : total,
            0,
          ) * vocation.formulas.armor,
        );
        if (!request.ignoreArmor && amount > 0 && armor > 0) {
          amount -= this.formula.armorReduction(armor);
          if (amount <= 0) {
            amount = 0;
            block = "armor";
          }
        }
        if (
          usedDefenseBlock &&
          block !== "none" &&
          shield?.type.weaponType === "shield" &&
          target.consumeShieldTrainingBlock()
        ) {
          this.progression.awardSkillTries(
            target.id,
            this.sequence.nextEventId(`shield:${target.id}`),
            "shielding",
            1,
            now,
          );
        }
      }
    }
    return { amount: Math.max(0, amount), block };
  }
}
