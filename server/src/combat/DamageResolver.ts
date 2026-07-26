import type { DamageType } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { MonsterEventHooks } from "../creature/MonsterEventHooks";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PartyHooks } from "../party/PartyHooks";
import { Player } from "../Player";
import type { PreyHooks } from "../prey/PreyHooks";
import type { ProficiencyHooks } from "../proficiency/ProficiencyHooks";
import { getVocation } from "../progression/getVocation";
import type { PvpHooks } from "../pvp/PvpHooks";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { applyCombatLocks } from "./applyCombatLocks";
import { blessingOfTheGroveBonus } from "./blessingOfTheGroveBonus";
import { playerTierBonuses } from "./playerTierBonuses";
import { catalogDamageType } from "./catalogDamageType";
import { CombatFeedback } from "./CombatFeedback";
import { MISSILE_DURATION_MS } from "./combatConstants";
import type { CombatFormula } from "./CombatFormula";
import type { DamageRequest, DamageResult } from "./Damage";
import { DeathHandler } from "./DeathHandler";
import { EventSequence } from "./EventSequence";
import {
  GIFT_OF_LIFE_EFFECT_ID,
  GIFT_OF_LIFE_MESSAGE,
  GIFT_OF_LIFE_SPELL_COOLDOWN_REDUCTION_MS,
  GIFT_OF_LIFE_STORAGE_KEY,
  giftOfLifeCooldownSeconds,
  giftOfLifeHealPercent,
} from "./giftOfLife";
import { playerDefense } from "./playerDefense";
import { playerMitigation } from "./playerMitigation";

const ARMOR_SLOTS = new Set([
  "helmet",
  "amulet",
  "armor",
  "legs",
  "boots",
  "ring",
  "ammo",
]);

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
    private readonly monsterEventHooks?: MonsterEventHooks,
    private readonly preyHooks?: PreyHooks,
    private readonly proficiencyHooks?: ProficiencyHooks,
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
      target instanceof Monster &&
      pvpSource instanceof Player &&
      target.type.callbacks.includes("onPlayerAttack")
    ) {
      this.monsterEventHooks?.onPlayerAttackMonster(target, pvpSource, now);
      if (this.world.getCreature(target.id) !== target) {
        return {
          amount: 0,
          block: "immunity",
          critical: false,
          healthChanged: false,
          manaChanged: false,
        };
      }
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
    // Gem-supreme dodge plus armor-tier ruse: one server-rolled full avoid
    // before any reduction (Canary Game::combatBlockHit, game.cpp:7874-7882;
    // Canary's BLOCK_DODGE is published as a miss here). Condition ticks
    // bypass it, like every Canary block step.
    if (
      target instanceof Player &&
      request.type !== "healing" &&
      request.type !== "mana-drain" &&
      request.origin !== "condition" &&
      this.formula.chance(
        target.wheelBonuses.dodgePercent +
          playerTierBonuses(this.items.combatEquipment(target.id))
            .dodgeChancePercent,
      )
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
    // Canary buff conditions scale the roll before mitigation: the caster's
    // outgoing buff, then the victim's incoming buff. Both are server-owned
    // conditions, so a client can never influence either factor.
    if (source && request.origin !== "condition") {
      const sourcePercent =
        request.type === "healing"
          ? source.conditions.healingDealtPercent
          : source.conditions.damageDealtPercent;
      if (sourcePercent !== 100) {
        amount = Math.max(0, Math.floor((amount * sourcePercent) / 100));
      }
    }
    if (request.type !== "healing") {
      const receivedPercent = target.conditions.damageReceivedPercent;
      if (receivedPercent !== 100) {
        amount = Math.max(0, Math.floor((amount * receivedPercent) / 100));
      }
    }
    if (request.type === "healing") {
      // Wheel of Destiny healing, in Canary's order: the augment multiplier,
      // the flat revelation-stage bonus, then Blessing of the Grove's
      // percent of the running value (Game::applyWheelOfDestinyHealing,
      // game.cpp:8250-8271).
      let healingLinkAmount = 0;
      if (source instanceof Player && amount > 0) {
        const healingPercent = request.wheelHealingPercent ?? 0;
        if (healingPercent > 0) {
          amount += Math.trunc((amount * healingPercent) / 100);
        }
        amount += source.wheelBonuses.damageAndHealing;
        // Healing Link reads the pre-Grove value, like Canary's ordering in
        // Game::applyWheelOfDestinyHealing (game.cpp:8250-8271).
        if ((request.healingLinkPercent ?? 0) > 0 && source !== target) {
          healingLinkAmount = Math.trunc(
            (amount * (request.healingLinkPercent ?? 0)) / 100,
          );
        }
        const grove = blessingOfTheGroveBonus(source, target);
        if (grove > 0) {
          amount += Math.floor((amount * grove) / 100);
        }
      }
      if (healingLinkAmount > 0 && source instanceof Player) {
        this.applyDamage(
          source,
          {
            sourceId: source.id,
            origin: "spell",
            type: "healing",
            minimum: healingLinkAmount,
            maximum: healingLinkAmount,
            allowReflection: false,
          },
          now,
        );
      }
      const before = target.health;
      target.setHealth(target.health + amount);
      const healed = target.health - before;
      this.publishDamageResult(target, request, healed, "none");
      if (source instanceof Player) source.analyzer.recordHealingDone(healed);
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
    if (target instanceof Monster && source && request.sourceId) {
      const healingPercent = target.type.heals[request.type] ?? 0;
      const elementalHealing = Math.ceil(amount * healingPercent / 100);
      if (elementalHealing > 0) {
        this.applyDamage(
          target,
          {
            sourceId: null,
            origin: "monster",
            type: "healing",
            minimum: elementalHealing,
            maximum: elementalHealing,
            allowReflection: false,
          },
          now,
        );
      }
    }
    const mitigated = this.mitigate(target, request, amount, now);
    amount = mitigated.amount;
    // Prey bonuses land right after the block steps (Canary doCombatHealth,
    // combat.cpp:778-800): the attacker's damage-boost prey, then the
    // defender's damage-reduction prey, each floor(amount * pct / 100).
    // Both re-read the live slot state at execution time; condition ticks
    // and mana drains never carry prey bonuses.
    if (
      amount > 0 &&
      request.type !== "mana-drain" &&
      request.origin !== "condition" &&
      this.preyHooks
    ) {
      if (source instanceof Player && target instanceof Monster) {
        const boost = this.preyHooks.damageBoostPercent(source.id, target);
        if (boost > 0) amount += Math.floor((amount * boost) / 100);
      }
      if (source instanceof Monster && target instanceof Player) {
        const reduction = this.preyHooks.damageReductionPercent(
          target.id,
          source,
        );
        if (reduction > 0) amount -= Math.floor((amount * reduction) / 100);
      }
    }
    // Proficiency powerful-foe: extra damage against bosses and forge-state
    // monsters (Canary weapon_proficiency.cpp:1302-1315).
    if (
      source instanceof Player &&
      target instanceof Monster &&
      amount > 0 &&
      this.proficiencyHooks &&
      (target.forgeStack > 0 || this.proficiencyHooks.isBoss(target))
    ) {
      const percent = this.proficiencyHooks.effectsFor(
        source.id,
      ).powerfulFoePercent;
      if (percent > 0) amount += Math.floor((amount * percent) / 100);
    }
    // Wheel damage lands after every block step, in Canary's order: the
    // augment multiplier first, then the flat revelation-stage bonus
    // (Game::applyWheelOfDestinyEffectsToDamage, game.cpp:8273-8288 inside
    // combatChangeHealth, which runs after blockHit). A fully blocked hit
    // stays blocked.
    if (
      source instanceof Player &&
      amount > 0 &&
      request.type !== "mana-drain"
    ) {
      const damagePercent = request.wheelDamagePercent ?? 0;
      if (damagePercent > 0) {
        amount += Math.trunc((amount * damagePercent) / 100);
      }
      amount += source.wheelBonuses.damageAndHealing;
    }
    if (target instanceof Monster && amount > 0) {
      amount = this.monsterEventHooks?.beforeMonsterDamage(
        target,
        source instanceof Player || source instanceof Monster
          ? source
          : undefined,
        amount,
        now,
      ) ?? amount;
    }
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
          this.feedback.sendFightStateForPlayer(target.id, now);
        }
      }
      if (amount > 0) {
        amount = this.applyGiftOfLife(target, amount, now);
        const before = target.health;
        target.setHealth(target.health - amount);
        amount = before - target.health;
        healthChanged = amount > 0;
      }
    }
    this.publishDamageResult(target, request, amount, mitigated.block);
    if (source instanceof Player) source.analyzer.recordDamageDealt(amount);
    if (target instanceof Player) target.analyzer.recordDamageTaken(amount);
    if (target instanceof Monster && source instanceof Player && amount > 0) {
      target.recordPlayerDamage(source.id, amount);
      this.partyHooks?.recordMonsterDamage(source.id, now);
    }
    if (target instanceof Monster && amount > 0) {
      this.monsterEventHooks?.onMonsterDamaged(
        target,
        source instanceof Player || source instanceof Monster
          ? source
          : undefined,
        amount,
        now,
      );
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
      // Equipment leech keeps its chance roll; wheel and gem leech always
      // apply, and the total scales down across multi-target casts and is
      // capped at the damage dealt (Canary Game::calculateLeechAmount,
      // game.cpp:9042-9045; condition ticks never leech, game.cpp:8746).
      const fromConditions = request.origin === "condition";
      const wheel = source.wheelBonuses;
      const lifePercent = fromConditions
        ? 0
        : (this.formula.chance(request.lifeLeechChance ?? 0)
            ? (request.lifeLeechPercent ?? 0)
            : 0) +
          wheel.lifeLeechPercent +
          (request.wheelLifeLeechPercent ?? 0);
      const manaPercent = fromConditions
        ? 0
        : (this.formula.chance(request.manaLeechChance ?? 0)
            ? (request.manaLeechPercent ?? 0)
            : 0) +
          wheel.manaLeechPercent +
          (request.wheelManaLeechPercent ?? 0);
      const targets = Math.max(1, request.leechTargets ?? 1);
      const spread = (0.1 * targets + 0.9) / targets;
      const healthLeech = Math.min(
        amount,
        Math.max(0, Math.round(amount * (lifePercent / 100) * spread)),
      );
      const manaLeech = Math.min(
        amount,
        Math.max(0, Math.round(amount * (manaPercent / 100) * spread)),
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
    if (
      source &&
      source !== target &&
      amount > 0 &&
      request.allowReflection !== false &&
      target instanceof Monster
    ) {
      const reflectPercent = target.type.reflects[request.type] ?? 0;
      const reflected = Math.min(
        Math.ceil(source.maxHealth * 0.01),
        Math.ceil(amount * reflectPercent / 100),
      );
      if (reflected > 0) {
        this.applyDamage(
          source,
          {
            sourceId: target.id,
            origin: "monster",
            type: request.type,
            minimum: reflected,
            maximum: reflected,
            ignoreArmor: true,
            ignoreShield: true,
            allowReflection: false,
          },
          now,
        );
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

  /**
   * The green revelation's death save (Canary Game::applyHealthChange,
   * game.cpp:8313-8328 + PlayerWheel::checkGiftOfLife, player_wheel.cpp:
   * 3116-3131): fatal damage inside the overkill window heals
   * stage-percent of max health first, the loss is capped at the pre-heal
   * health, every spell cooldown drops a minute, and the long cooldown
   * starts. All state is server-owned; the client only sees the outcome.
   */
  private applyGiftOfLife(
    target: Creature,
    amount: number,
    now: number,
  ): number {
    if (!(target instanceof Player) || amount < target.health) return amount;
    const stage = target.wheelBonuses.revelationStages.green;
    if (stage < 1) return amount;
    if (target.storageValue(GIFT_OF_LIFE_STORAGE_KEY) > 0) return amount;
    const overkillPercent =
      ((amount - target.health) * 100) / target.maxHealth;
    if (overkillPercent > giftOfLifeHealPercent(stage)) return amount;
    const preHealHealth = target.health;
    const heal = Math.floor(
      (target.maxHealth * giftOfLifeHealPercent(stage)) / 100,
    );
    target.setHealth(Math.min(target.maxHealth, target.health + heal));
    target.setStorageValue(
      GIFT_OF_LIFE_STORAGE_KEY,
      giftOfLifeCooldownSeconds(stage),
    );
    this.visibility.broadcastMagicEffect(
      target.position,
      GIFT_OF_LIFE_EFFECT_ID,
      target.id,
    );
    const session = this.registry.sessionFor(target.id);
    if (session) {
      session.send({
        type: "combat-log",
        kind: "condition",
        text: GIFT_OF_LIFE_MESSAGE,
      });
      for (const [key, entry] of session.combatCooldowns) {
        if (!key.startsWith("spell:")) continue;
        session.combatCooldowns.set(key, {
          ...entry,
          readyAt: entry.readyAt - GIFT_OF_LIFE_SPELL_COOLDOWN_REDUCTION_MS,
        });
      }
      this.feedback.sendFightStateForPlayer(target.id, now);
    }
    return Math.min(amount, preHealHealth);
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
    // One visibility scan shared by the effect/text/health broadcasts below;
    // they all target the same "viewers who know the target" recipient set.
    const recipients = this.visibility.knowingViewersOf(target);
    if (request.effectId) {
      this.visibility.broadcastMagicEffect(
        target.position,
        request.effectId,
        target.id,
        recipients,
      );
    }
    this.visibility.broadcastCombatText(
      target,
      amount,
      request.type,
      block,
      recipients,
    );
    this.visibility.broadcastHealth(target, recipients);
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
        (!request.ignoreShield || !request.ignoreArmor) &&
        !target.conditions.defenseDisabled;
      const usedDefenseBlock =
        checksPhysical && target.consumeDefenseBlock(now);
      if (request.type === "physical") {
        // Influenced/fiendish monsters defend harder (Canary
        // monster.cpp:3558-3564: x1 + 0.1 per stack).
        const forgeDefense = target.forgeDefenseMultiplier;
        if (
          !request.ignoreShield &&
          usedDefenseBlock &&
          (stats?.defense ?? 0) > 0
        ) {
          amount -= this.formula.defenseReduction(
            Math.round((stats?.defense ?? 0) * forgeDefense),
          );
          if (amount <= 0) {
            amount = 0;
            block = "shield";
          }
        }
        if (!request.ignoreArmor && amount > 0 && (stats?.armor ?? 0) > 0) {
          amount -= this.formula.armorReduction(
            Math.round((stats?.armor ?? 0) * forgeDefense),
          );
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
      const gemResistances: Partial<Record<DamageType, number>> =
        target.wheelBonuses.resistances;
      const absorb =
        equipment.reduce(
          (total, entry) =>
            total + (entry.type.absorbPercent?.[absorbType] ?? 0),
          0,
        ) + (request.type === "healing" ? 0 : (gemResistances[request.type] ?? 0));
      if (absorb >= 100) return { amount: 0, block: "immunity" };
      amount = this.formula.applyAbsorbPercent(amount, absorb);
      // Elemental-protection imbuements reduce sequentially per running
      // imbuement, each `damage -= ceil(damage * pct / 100)` — Canary
      // player.cpp:3872-3884, multiplicative stacking.
      if (request.type !== "healing" && amount > 0) {
        const reductions =
          this.items.imbuementEffects(target.id).absorb[request.type] ?? [];
        for (const percent of reductions) {
          amount -= Math.ceil((amount * percent) / 100);
          if (amount <= 0) {
            amount = 0;
            break;
          }
        }
      }
      if (request.type === "physical") {
        const session = this.registry.sessionFor(target.id);
        const shield = equipment.find(
          (entry) =>
            entry.item.location.kind === "equipment" &&
            entry.item.location.slot === "shield",
        );
        const checksPhysical =
          (!request.ignoreShield || !request.ignoreArmor) &&
          !target.conditions.defenseDisabled;
        const usedDefenseBlock =
          checksPhysical && target.consumeDefenseBlock(now);
        if (!request.ignoreShield && usedDefenseBlock) {
          // Proficiency defense/shield-modifier perks join the weapon's own
          // defense value (player.cpp:781-817).
          const proficiencyDefense = this.proficiencyHooks
            ? this.proficiencyHooks.effectsFor(target.id)
            : undefined;
          amount -= this.formula.defenseReduction(
            playerDefense(
              target,
              equipment,
              session?.fightMode.attack ?? "offensive",
              now,
              this.items.imbuementEffects(target.id).skills,
            ) +
              Math.round(
                (proficiencyDefense?.defenseBonus ?? 0) +
                  (proficiencyDefense?.shieldModifier ?? 0),
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
              ARMOR_SLOTS.has(entry.item.location.slot)
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
      // Player mitigation runs after shield and armor for every damage type
      // except the drains, mirroring Canary's Creature::mitigateDamage
      // (creature.cpp:911-922, called after both block rolls). Canary
      // subtracts the *truncated reduction* — `damage -= (damage * m) / 100`
      // in integer arithmetic — so a sub-1 reduction changes nothing.
      // Condition ticks bypass Canary's blockHit entirely, so also this.
      if (
        request.type !== "life-drain" &&
        request.type !== "mana-drain" &&
        request.origin !== "condition" &&
        amount > 0
      ) {
        const fightSession = this.registry.sessionFor(target.id);
        const mitigation = playerMitigation(
          target,
          equipment,
          fightSession?.fightMode?.attack ?? "balanced",
          this.items.imbuementEffects(target.id).skills.shielding ?? 0,
        );
        if (mitigation > 0) {
          amount = Math.max(
            0,
            amount - Math.trunc((amount * mitigation) / 100),
          );
          if (amount === 0) block = "armor";
        }
      }
    }
    return { amount: Math.max(0, amount), block };
  }
}
