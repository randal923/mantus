import {
  PREMIUM_BENEFITS,
  type CombatTarget,
  type ServerErrorCode,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { Monster } from "../creature/Monster";
import { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { aimDirectionFor } from "./aimDirectionFor";
import { areaPositions } from "./areaPositions";
import { applySpellCooldowns } from "./applySpellCooldowns";
import { canPlayerHarm } from "./canPlayerHarm";
import { CombatFeedback } from "./CombatFeedback";
import type { CombatFormula } from "./CombatFormula";
import {
  MISSILE_DURATION_MS,
  SPELL_FAILURE_EFFECT_ID,
} from "./combatConstants";
import { ConditionSystem } from "./ConditionSystem";
import { creaturesInArea } from "./creaturesInArea";
import { DamageResolver } from "./DamageResolver";
import { EventSequence } from "./EventSequence";
import { isInRange } from "./isInRange";
import { matchesSpellTarget } from "./matchesSpellTarget";
import { playerCombatSkill } from "./playerCombatSkill";
import { playerForSession } from "./playerForSession";
import { playerMagicLevel } from "./playerMagicLevel";
import { playerSpecials } from "./playerSpecials";
import { resolveSpellTarget } from "./resolveSpellTarget";
import type { Creature } from "../creature/Creature";
import type { DelayedSpellDetonation } from "./DelayedSpellDetonation";
import type { ResolvedSpellTarget } from "./resolveSpellTarget";
import type { WheelAugmentGrade } from "./wheelSpellAugments";
import { wheelExecutionersThrowPercent } from "./wheelExecutionersThrow";
import { skillForWeapon } from "./skillForWeapon";
import type { SpellDefinition } from "./Spell";
import { spellCondition } from "./spellCondition";
import { wheelBeamMasteryFor } from "./wheelBeamMastery";
import { wheelSpellAugmentFor } from "./wheelSpellAugments";
import type { PvpHooks } from "../pvp/PvpHooks";
import type { PartyHooks } from "../party/PartyHooks";

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
    private readonly pvpHooks?: PvpHooks,
    private readonly partyHooks?: PartyHooks,
    private readonly formula?: CombatFormula,
    private readonly conjuringSpellFor?: (
      runeItemTypeId: number,
    ) => SpellDefinition | undefined,
    /** Hands fuse spells (Divine Grenade) to the tick-owned detonation queue. */
    private readonly queueDetonation?: (
      detonation: DelayedSpellDetonation,
    ) => void,
  ) {}

  /** Reports whether the spell was actually cast; a false result was rejected. */
  executeSpell(
    session: Session,
    spell: SpellDefinition,
    targetIntent: CombatTarget,
    now: number,
    spendResources: boolean,
  ): boolean {
    const player = playerForSession(this.world, session);
    if (!player) {
      this.feedback.reject(session, now, "spell-unavailable");
      return false;
    }
    const rejection = this.spellRejectionCode(
      session,
      player,
      spell,
      targetIntent,
      now,
    );
    if (rejection) {
      this.feedback.reject(session, now, rejection);
      return false;
    }
    const target = resolveSpellTarget(
      this.world,
      session,
      player,
      targetIntent,
      aimDirectionFor(this.world, session, player, spell),
    );
    if (!target) {
      this.feedback.reject(session, now, "spell-target-invalid");
      return false;
    }
    // Wheel augments re-read from the server-owned allocation at cast time.
    const augment = wheelSpellAugmentFor(player, spell);
    const beamMastery = wheelBeamMasteryFor(player, spell);
    const manaCost = Math.max(
      0,
      spell.manaCost - (augment.manaCostReduction ?? 0),
    );
    if (spendResources) {
      if (!player.spendMana(manaCost)) {
        this.feedback.reject(session, now, "spell-mana-insufficient");
        return false;
      }
      if (!player.spendSoul(spell.soulCost)) {
        player.restoreMana(manaCost);
        this.feedback.reject(session, now, "spell-soul-insufficient");
        return false;
      }
    }
    applySpellCooldowns(this.feedback, session, spell, now, {
      spellMs: augment.cooldownReductionMs ?? 0,
      secondaryGroupMs: augment.secondaryGroupCooldownReductionMs ?? 0,
      ...(spell.playerAction === "avatar" && player.isPremiumAt(now)
        ? { spellMultiplier: PREMIUM_BENEFITS.wheelCooldownMultiplier }
        : {}),
    });
    if (spendResources && manaCost > 0) {
      this.progression.awardMagicProgress(
        player.id,
        this.sequence.nextEventId(`magic:${player.id}`),
        manaCost,
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
    const imbuements = this.items.imbuementEffects(player.id);
    const affixes = this.items.affixEffects(player.id);
    const weaponSkill = skillForWeapon(weapon?.type.weaponType);
    const variables = {
      level: player.level,
      magicLevel: this.runicMasteryMagicLevel(
        player,
        spell,
        playerMagicLevel(
          player,
          equipment,
          imbuements.magicLevel + affixes.magicLevel,
        ),
      ),
      skill: playerCombatSkill(
        player,
        equipment,
        weaponSkill,
        (imbuements.skills[weaponSkill] ?? 0) +
          (affixes.skills[weaponSkill] ?? 0),
      ),
      attack:
        (weapon?.type.attack ?? 7) +
        (weapon?.type.weaponType === "distance"
          ? (ammunition?.type.attack ?? 0)
          : 0),
    };
    const minimum = Math.max(
      0,
      Math.floor(Math.abs(spell.formula.minimum(variables))),
    );
    const maximum = Math.max(
      minimum,
      Math.floor(Math.abs(spell.formula.maximum(variables))),
    );
    if (spell.delayed) {
      this.queueDelayedDetonation(
        session,
        player,
        spell,
        target,
        augment,
        equipment,
        minimum,
        maximum,
        now,
      );
      this.feedback.sendFightState(session, now);
      return true;
    }
    // Beam Mastery and grade-2 augments swap in the upgraded combat area.
    const area = beamMastery?.area ?? augment.area ?? spell.area;
    const affected = spell.chain
      ? this.chainAffected(session, player, spell, target, augment)
      : creaturesInArea(this.world, player.position, target.position, area);
    const usesAreaEffect = area.shape !== "single";
    if (usesAreaEffect && spell.effectId > 0) {
      const effectPositions = areaPositions(
        player.position,
        target.position,
        area,
      ).filter(
        (position) =>
          this.world.getTile(position) &&
          this.world.hasLineOfSight(player.position, position),
      );
      for (const position of effectPositions) {
        this.visibility.broadcastMagicEffect(position, spell.effectId);
      }
    }
    if (
      !spell.chain &&
      area.shape === "single" &&
      target.creature &&
      affected.length === 0
    ) {
      affected.push(target.creature);
    }
    const specials = playerSpecials(equipment, player, now);
    // Focus Mastery: the armed window boosts the next spell damage once
    // (Canary player_wheel.cpp:3313-3319); casting a focus-group spell arms
    // it for twelve seconds afterwards.
    let focusMasteryPercent = 0;
    if (
      maximum > 0 &&
      spell.damageType !== "healing" &&
      now < player.focusMasteryUntil
    ) {
      focusMasteryPercent = 35;
      player.focusMasteryUntil = 0;
    }
    if (
      spell.groups.includes("focus") &&
      player.wheelBonuses.instants["Focus Mastery"] === true
    ) {
      player.focusMasteryUntil = now + 12_000;
    }
    // Healing Link self-heals the Druid for a tenth of the linked heals.
    const healingLinkPercent =
      player.wheelBonuses.instants["Healing Link"] === true &&
      (spell.id === "exura-sio" || spell.id === "exura-gran-sio")
        ? 10
        : 0;
    if (maximum > 0) {
      // Resolved once so leech can scale by the number of struck targets
      // (Canary's calculateLeechAmount reads damage.affected).
      const damageTargets = affected.filter(
        (creature) =>
          spell.damageType === "healing" ||
          canPlayerHarm(this.world, session, player, creature, this.pvpHooks),
      );
      damageTargets.forEach((creature, index) => {
        // Beam Mastery shares Canary's one CombatDamage across the sweep:
        // the multiplier accumulates over the first three targets.
        const beamPercent = beamMastery
          ? beamMastery.damagePercentPerTarget * Math.min(index + 1, 3)
          : 0;
        this.damage.applyDamage(
          creature,
          {
            sourceId: player.id,
            origin: spell.origin,
            type: spell.damageType,
            minimum,
            maximum,
            ...(usesAreaEffect ? {} : { effectId: spell.effectId }),
            ignoreArmor: !spell.blockArmor,
            ignoreShield: !spell.blockShield,
            ...specials,
            criticalChance:
              specials.criticalChance + (augment.criticalChance ?? 0),
            criticalDamagePercent:
              specials.criticalDamagePercent +
              (augment.criticalDamagePercent ?? 0),
            leechTargets: damageTargets.length,
            wheelDamagePercent:
              (augment.damagePercent ?? 0) +
              beamPercent +
              focusMasteryPercent +
              wheelExecutionersThrowPercent(player, spell, creature),
            wheelHealingPercent: augment.healPercent ?? 0,
            wheelLifeLeechPercent: augment.lifeLeechPercent ?? 0,
            wheelManaLeechPercent: augment.manaLeechPercent ?? 0,
            healingLinkPercent,
          },
          now,
        );
      });
      if (beamMastery && damageTargets.length > 0) {
        this.reduceSpellCooldowns(
          session,
          beamMastery.cooldownReductionPerTargetMs *
            Math.min(damageTargets.length, 3),
        );
      }
    } else if (!usesAreaEffect && spell.effectId > 0) {
      this.visibility.broadcastMagicEffect(
        target.position,
        spell.effectId,
        target.creature?.id,
      );
    }
    // The upgraded Sap Strength debuffs harder (sap_strength.lua:23-27).
    const conditionSpell =
      augment.conditionDamageDealtPercent && spell.condition
        ? {
            ...spell,
            condition: {
              ...spell.condition,
              damageDealtPercent: augment.conditionDamageDealtPercent,
            },
          }
        : spell;
    if (conditionSpell.condition) {
      for (const creature of affected.length > 0 ? affected : [player]) {
        // Canary's crippling target callbacks refuse players outright, so the
        // debuff can never be turned on another character.
        if (
          conditionSpell.condition.monstersOnly &&
          !(creature instanceof Monster)
        ) {
          continue;
        }
        if (
          spell.damageType !== "healing" &&
          !canPlayerHarm(this.world, session, player, creature, this.pvpHooks)
        ) {
          continue;
        }
        const condition = spellCondition(
          player,
          creature,
          conditionSpell,
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
        this.conditions.removeCondition(creature, spell.dispel, now);
      }
    }
    this.feedback.sendFightState(session, now);
    return true;
  }

  /**
   * Arms a fuse spell (Divine Grenade): the impact position is clamped to
   * the caster's side like Canary's getWithinRange, the roll is snapshotted,
   * and the detonation itself runs in a later tick where every target is
   * re-validated.
   */
  private queueDelayedDetonation(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    target: ResolvedSpellTarget,
    augment: WheelAugmentGrade,
    equipment: Parameters<typeof playerSpecials>[0],
    minimum: number,
    maximum: number,
    now: number,
  ): void {
    const delayed = spell.delayed;
    if (!delayed || !this.queueDetonation) return;
    const clamp = (delta: number) =>
      Math.max(-delayed.clampRange, Math.min(delayed.clampRange, delta));
    const position = {
      x: player.position.x + clamp(target.position.x - player.position.x),
      y: player.position.y + clamp(target.position.y - player.position.y),
      z: player.position.z,
    };
    if (delayed.fuseEffectId > 0) {
      this.visibility.broadcastMagicEffect(position, delayed.fuseEffectId);
    }
    const specials = playerSpecials(equipment, player, now);
    this.queueDetonation({
      executeAt: now + delayed.delayMs,
      casterId: player.id,
      position,
      area: spell.area,
      damageType: spell.damageType,
      minimum,
      maximum,
      effectId: spell.effectId,
      ignoreArmor: !spell.blockArmor,
      ignoreShield: !spell.blockShield,
      specials: {
        ...specials,
        criticalChance:
          specials.criticalChance + (augment.criticalChance ?? 0),
        criticalDamagePercent:
          specials.criticalDamagePercent +
          (augment.criticalDamagePercent ?? 0),
      },
      wheelDamagePercent: augment.damagePercent ?? 0,
      wheelLifeLeechPercent: augment.lifeLeechPercent ?? 0,
      wheelManaLeechPercent: augment.manaLeechPercent ?? 0,
    });
  }

  /**
   * Canary doCombatChain target picking: nearest first, each hop within
   * `hopDistance` of the previous target, never revisiting one, and every
   * candidate re-checked against the harm rules at execution time.
   */
  private chainAffected(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    target: ResolvedSpellTarget,
    augment: WheelAugmentGrade,
  ): Creature[] {
    const chain = spell.chain;
    if (!chain) return [];
    const limit = chain.maxTargets + (augment.additionalTargets ?? 0);
    const distance = (from: Creature | Player, to: Creature) =>
      Math.max(
        Math.abs(from.position.x - to.position.x),
        Math.abs(from.position.y - to.position.y),
      );
    const targets: Creature[] = [];
    const visited = new Set([player.id]);
    let current: Creature | Player = player;
    if (target.creature && target.creature !== player) {
      if (
        !canPlayerHarm(this.world, session, player, target.creature, this.pvpHooks)
      ) {
        return [];
      }
      targets.push(target.creature);
      visited.add(target.creature.id);
      current = target.creature;
    }
    while (targets.length < limit) {
      const next = this.world
        .creaturesNear(current.position, {
          x: chain.hopDistance,
          y: chain.hopDistance,
        })
        .filter(
          (creature) =>
            !visited.has(creature.id) &&
            creature.health > 0 &&
            creature.position.z === current.position.z &&
            isInRange(current.position, creature.position, chain.hopDistance) &&
            canPlayerHarm(this.world, session, player, creature, this.pvpHooks) &&
            this.world.hasLineOfSight(current.position, creature.position),
        )
        .sort(
          (left, right) =>
            distance(current, left) - distance(current, right) ||
            left.id.localeCompare(right.id),
        )[0];
      if (!next) break;
      targets.push(next);
      visited.add(next.id);
      current = next;
    }
    return targets;
  }

  /**
   * Floor-moving spells (magic rope, levitate). The movement attempt runs
   * before resources are spent; everything here is synchronous inside the
   * tick and mana/soul were pre-checked, so success can never underpay.
   * Reports whether the spell was cast.
   */
  executeWorldSpell(
    session: Session,
    spell: SpellDefinition,
    now: number,
    attempt: (player: Player) => boolean,
    /** The intent's target; direction casts need it to pass the target check. */
    targetIntent: CombatTarget = { kind: "self" },
  ): boolean {
    const player = playerForSession(this.world, session);
    if (!player) {
      this.feedback.reject(session, now, "spell-unavailable");
      return false;
    }
    const rejection = this.spellRejectionCode(
      session,
      player,
      spell,
      targetIntent,
      now,
    );
    if (rejection) {
      this.feedback.reject(session, now, rejection);
      return false;
    }
    if (!attempt(player)) {
      this.visibility.broadcastMagicEffect(
        player.position,
        SPELL_FAILURE_EFFECT_ID,
        player.id,
      );
      this.feedback.reject(session, now, "spell-not-possible");
      return false;
    }
    if (!player.spendMana(spell.manaCost) || !player.spendSoul(spell.soulCost)) {
      throw new Error("world spell resources diverged");
    }
    // Wheel grades shorten procedural-spell cooldowns too (Divine Dazzle's
    // grade 2, the avatars' 30-minute revelation steps).
    const augment = wheelSpellAugmentFor(player, spell);
    applySpellCooldowns(this.feedback, session, spell, now, {
      spellMs: augment.cooldownReductionMs ?? 0,
      secondaryGroupMs: augment.secondaryGroupCooldownReductionMs ?? 0,
      ...(spell.playerAction === "avatar" && player.isPremiumAt(now)
        ? { spellMultiplier: PREMIUM_BENEFITS.wheelCooldownMultiplier }
        : {}),
    });
    if (spell.manaCost > 0) {
      this.progression.awardMagicProgress(
        player.id,
        this.sequence.nextEventId(`magic:${player.id}`),
        spell.manaCost,
        now,
      );
    } else if (spell.soulCost > 0) {
      this.progression.syncPlayer(player, now, true);
    }
    if (spell.effectId > 0) {
      this.visibility.broadcastMagicEffect(
        player.position,
        spell.effectId,
        player.id,
      );
    }
    this.feedback.sendFightState(session, now);
    return true;
  }

  /**
   * Conjuring spells. `conjureOverride` carries a server-rolled item/count for
   * the random-food spell; the roll happens in the tick before this call, so
   * the client never influences which item or how many are created.
   * Reports whether the conjuring operation was started — its own commit
   * still owns the outcome.
   */
  executeConjure(
    session: Session,
    spell: SpellDefinition,
    targetIntent: CombatTarget,
    now: number,
    conjureOverride?: SpellDefinition["conjure"],
  ): boolean {
    const player = playerForSession(this.world, session);
    const conjure = conjureOverride ?? spell.conjure;
    if (!player || !conjure) {
      this.feedback.reject(session, now, "spell-unavailable");
      return false;
    }
    const rejection = this.spellRejectionCode(
      session,
      player,
      spell,
      targetIntent,
      now,
    );
    if (rejection) {
      this.feedback.reject(session, now, rejection);
      return false;
    }
    const expectedMana = player.mana;
    const expectedSoul = player.progression.soul;
    const expectedVersion = this.persistence.beginExternalMutation(
      player,
      now,
    );
    const started = this.items.conjureForCombat(
      session,
      expectedVersion,
      expectedMana,
      expectedSoul,
      spell.manaCost,
      spell.soulCost,
      conjure.sourceItemTypeId,
      conjure.targetItemTypeId,
      conjure.count,
      undefined,
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
    if (!started) {
      this.persistence.cancelExternalMutation(player);
      return false;
    }
    return true;
  }

  canBeginSpell(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    target: CombatTarget,
    now: number,
  ): boolean {
    return (
      this.spellRejectionCode(session, player, spell, target, now) === null
    );
  }

  /**
   * The Runic Mastery conviction: rune damage rolls a bell-curved 25 %
   * chance to boost the formula's magic level by 20 % (10 % when the caster
   * cannot cast the rune's conjuring spell) — Canary
   * ValueCallback::getMagicLevelSkill, combat.cpp:1815-1833. Server RNG.
   */
  private runicMasteryMagicLevel(
    player: Player,
    spell: SpellDefinition,
    magicLevel: number,
  ): number {
    if (
      spell.origin !== "rune" ||
      !player.wheelBonuses.instants["Runic Mastery"] ||
      !this.formula ||
      this.formula.normalInteger(0, 100) > 25
    ) {
      return magicLevel;
    }
    const conjuring = spell.runeItemTypeId
      ? this.conjuringSpellFor?.(spell.runeItemTypeId)
      : undefined;
    if (!conjuring) return magicLevel;
    const canConjure =
      conjuring.vocations.includes(player.vocation) &&
      player.level >= conjuring.requiredLevel &&
      magicLevel >= conjuring.requiredMagicLevel;
    return magicLevel + Math.trunc((magicLevel * (canConjure ? 20 : 10)) / 100);
  }

  /** Canary reduceAllSpellsCooldownTimer: every spell cooldown shortens. */
  private reduceSpellCooldowns(session: Session, reductionMs: number): void {
    if (reductionMs <= 0) return;
    for (const [key, entry] of session.combatCooldowns) {
      if (!key.startsWith("spell:")) continue;
      session.combatCooldowns.set(key, {
        ...entry,
        readyAt: entry.readyAt - reductionMs,
      });
    }
  }

  private spellRejectionCode(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    target: CombatTarget,
    now: number,
  ): ServerErrorCode | null {
    const equipment = this.items.combatEquipment(player.id);
    if (session.itemOperationPending) return "spell-busy";
    if (player.conditions.has("mute")) return "spell-muted";
    if (!spell.vocations.includes(player.vocation)) {
      return "spell-vocation-restricted";
    }
    if (
      spell.wheelRevelation &&
      player.wheelBonuses.revelationStages[spell.wheelRevelation.domain] <
        spell.wheelRevelation.minimumStage
    ) {
      return "spell-not-learned";
    }
    if (player.level < spell.requiredLevel) return "spell-level-restricted";
    if (
      playerMagicLevel(
        player,
        equipment,
        this.items.imbuementEffects(player.id).magicLevel +
          this.items.affixEffects(player.id).magicLevel,
      ) < spell.requiredMagicLevel
    ) {
      return "spell-magic-level-restricted";
    }
    const manaCost = Math.max(
      0,
      spell.manaCost -
        (wheelSpellAugmentFor(player, spell).manaCostReduction ?? 0),
    );
    if (player.mana < manaCost) return "spell-mana-insufficient";
    if (player.progression.soul < spell.soulCost) {
      return "spell-soul-insufficient";
    }
    if (!matchesSpellTarget(spell, target)) return "spell-target-invalid";
    if (
      (session.combatCooldowns.get(`spell:${spell.id}`)?.readyAt ?? 0) > now ||
      spell.groups.some(
        (group) =>
          (session.combatCooldowns.get(`group:${group}`)?.readyAt ?? 0) > now,
      )
    ) {
      return "spell-exhausted";
    }
    if (
      spell.needWeapon &&
      !equipment.some(
        (entry) =>
          entry.item.location.kind === "equipment" &&
          entry.item.location.slot === "weapon" &&
          entry.type.weaponType !== undefined &&
          entry.type.weaponType !== "shield",
      )
    ) {
      return "spell-weapon-required";
    }
    const resolved = resolveSpellTarget(
      this.world,
      session,
      player,
      target,
      aimDirectionFor(this.world, session, player, spell),
    );
    if (!resolved) return "spell-target-invalid";
    if (spell.castRules?.excludedVocations.includes(player.vocation)) {
      return "spell-vocation-restricted";
    }
    if (
      spell.castRules &&
      ((spell.castRules.targetPlayerOnly &&
        !(resolved.creature instanceof Player)) ||
        (!spell.castRules.allowSelf && resolved.creature === player))
    ) {
      return "spell-target-invalid";
    }
    if (
      spell.castRules?.targetPartyMemberOnly &&
      (!(resolved.creature instanceof Player) ||
        !this.partyHooks?.sameParty(player.id, resolved.creature.id))
    ) {
      return "spell-target-invalid";
    }
    const harmful = spell.damageType !== "healing";
    if (
      harmful &&
      (this.world.isProtectionZone(player.position) ||
        this.world.isProtectionZone(resolved.position))
    ) {
      return "spell-protection-zone";
    }
    if (
      harmful &&
      resolved.creature &&
      resolved.creature !== player &&
      !canPlayerHarm(
        this.world,
        session,
        player,
        resolved.creature,
        this.pvpHooks,
      )
    ) {
      return "spell-target-protected";
    }
    if (
      target.kind !== "direction" &&
      !isInRange(player.position, resolved.position, spell.range)
    ) {
      return "spell-out-of-range";
    }
    if (
      spell.lineOfSight &&
      !this.world.hasLineOfSight(player.position, resolved.position)
    ) {
      return "spell-line-of-sight";
    }
    return null;
  }
}
