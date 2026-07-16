import type {
  CastSpellMessage,
  CombatTarget,
  DamageType,
  Direction,
  FightMode,
  Position,
  SetFightModeMessage,
  Skill,
  UseRuneMessage,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { MonsterAbility } from "../creature/MonsterType";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { ItemType } from "../item/ItemType";
import type { LootItemCreation } from "../item/LootItemCreation";
import { findPath } from "../pathfinding/findPath";
import { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import { getVocation } from "../progression/getVocation";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { MoveResult, World } from "../World";
import { CombatFormula } from "./CombatFormula";
import type { ConditionApplication } from "./Condition";
import type { DamageRequest, DamageResult } from "./Damage";
import { getMagicEffectId } from "./getMagicEffectId";
import { getMissileId } from "./getMissileId";
import { projectFightState } from "./projectFightState";
import type { SpellDefinition } from "./Spell";
import { SpellRegistry } from "./SpellRegistry";

type CatalogDamageType = keyof NonNullable<ItemType["absorbPercent"]>;

const PLAYER_DEATH_INVULNERABILITY_MS = 2_000;
const COMBAT_LOCK_MS = 60_000;
const MISSILE_DURATION_MS = 250;
const PLAYER_CHASE_PATH_BUDGET = 32;

interface PlayerAttackPlan {
  readonly targetId: string;
  readonly range: number;
  readonly lineOfSight: boolean;
  readonly requests: ReadonlyArray<DamageRequest>;
  readonly skill: Skill;
  readonly manaCost: number;
  readonly consume?: {
    readonly itemId: string;
    readonly revision: number;
    readonly reason: "ammunition" | "break";
  };
  readonly breakable?: {
    readonly itemId: string;
    readonly revision: number;
    readonly chance: number;
  };
}

interface ResolvedSpellTarget {
  readonly position: Position;
  readonly creature: Creature | null;
}

interface PlayerSpecials {
  readonly criticalChance: number;
  readonly criticalDamagePercent: number;
  readonly lifeLeechChance: number;
  readonly lifeLeechPercent: number;
  readonly manaLeechChance: number;
  readonly manaLeechPercent: number;
}

export class Combat {
  private readonly formula: CombatFormula;
  private readonly spells = new SpellRegistry();
  private eventSequence = 0;

  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    private readonly persistence: CharacterPersistence,
    private readonly progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    seed: number,
    private readonly onMonsterDeath: (monster: Monster, now: number) => boolean,
  ) {
    this.formula = new CombatFormula(seed);
  }

  selectTarget(session: Session, creatureId: string, now: number): void {
    const player = this.playerFor(session);
    const target = this.world.getCreature(creatureId);
    if (
      !player ||
      !target ||
      !session.knownCreatureIds.has(target.id) ||
      !this.world.canSee(player.position, target.position, session.viewRange) ||
      !this.canPlayerTarget(session, player, target)
    ) {
      this.reject(session, now);
      return;
    }
    this.setTarget(session, target.id, now);
  }

  cancelTarget(session: Session, now: number): void {
    if (!this.playerFor(session)) {
      session.sendError("join-required");
      return;
    }
    this.setTarget(session, null, now);
  }

  setFightMode(
    session: Session,
    intent: SetFightModeMessage,
    now: number,
  ): void {
    if (!this.playerFor(session)) {
      session.sendError("join-required");
      return;
    }
    session.fightMode = { ...intent.mode };
    const target = session.attackTargetId
      ? this.world.getCreature(session.attackTargetId)
      : undefined;
    if (
      target instanceof Player &&
      session.fightMode.secure
    ) {
      session.attackTargetId = null;
      session.send({ type: "attack-target-changed", creatureId: null });
    }
    this.sendFightState(session, now);
  }

  castSpell(
    session: Session,
    intent: CastSpellMessage,
    now: number,
  ): void {
    const spell = this.spells.get(intent.spellId);
    if (!spell || spell.origin !== "spell") {
      this.reject(session, now);
      return;
    }
    this.executeSpell(session, spell, intent.target, now, true);
  }

  useRune(session: Session, intent: UseRuneMessage, now: number): void {
    const player = this.playerFor(session);
    const combatItem = player
      ? this.items.combatItem(player.id, intent.itemId, intent.revision)
      : null;
    const spell = combatItem
      ? this.spells.getRune(combatItem.item.typeId)
      : undefined;
    if (
      !player ||
      !combatItem ||
      combatItem.type.kind !== "rune" ||
      !spell ||
      !this.canBeginSpell(session, player, spell, intent.target, now)
    ) {
      this.reject(session, now);
      return;
    }
    this.items.consumeForCombat(
      session,
      intent.itemId,
      intent.revision,
      "rune",
      (committedAt) => {
        this.executeSpell(
          session,
          spell,
          intent.target,
          committedAt,
          false,
        );
      },
    );
  }

  tick(now: number): void {
    this.tickConditions(now);
    for (const session of this.registry.all()) {
      this.tickPlayerAttack(session, now);
    }
  }

  executeMonsterAbility(
    monster: Monster,
    target: Player | null,
    ability: MonsterAbility,
    now: number,
  ): boolean {
    if (
      monster.health <= 0 ||
      this.world.getCreature(monster.id) !== monster ||
      ability.kind === "stats"
    ) {
      return false;
    }
    const resolvedTarget = ability.target === "self" ? monster : target;
    if (
      !resolvedTarget ||
      resolvedTarget.health <= 0 ||
      this.world.getCreature(resolvedTarget.id) !== resolvedTarget
    ) {
      return false;
    }
    if (
      resolvedTarget !== monster &&
      (!this.isInRange(monster.position, resolvedTarget.position, ability.range) ||
        !this.world.hasLineOfSight(monster.position, resolvedTarget.position) ||
        (resolvedTarget instanceof Player &&
          (this.world.isProtectionZone(monster.position) ||
            this.world.isProtectionZone(resolvedTarget.position))))
    ) {
      return false;
    }
    const center =
      ability.target === "self" ? monster.position : resolvedTarget.position;
    if (ability.missile && resolvedTarget !== monster) {
      const missileId = getMissileId(ability.missile);
      if (missileId) {
        this.visibility.broadcastDistanceMissile(
          monster.position,
          resolvedTarget.position,
          missileId,
          MISSILE_DURATION_MS,
          [monster.id, resolvedTarget.id],
        );
      }
    }
    const effectId = getMagicEffectId(ability.effect);
    if (ability.kind === "effect") {
      this.visibility.broadcastMagicEffect(
        center,
        effectId,
        resolvedTarget.id,
      );
      return true;
    }
    const affected =
      ability.area.shape === "single"
        ? [resolvedTarget]
        : this.creaturesInArea(monster.position, center, ability.area);
    if (ability.kind === "condition" && ability.conditionType) {
      for (const creature of affected) {
        if (creature === monster && ability.target !== "self") continue;
        if (!this.canMonsterAffect(monster, creature)) continue;
        this.applyCondition(
          creature,
          {
            type: ability.conditionType,
            sourceId: monster.id,
            durationMs: ability.durationMs ?? 5_000,
            ...(ability.magnitude !== undefined
              ? { magnitude: ability.magnitude }
              : {}),
            ...(ability.tickIntervalMs !== undefined
              ? { tickIntervalMs: ability.tickIntervalMs }
              : {}),
            ...(ability.damageType ? { damageType: ability.damageType } : {}),
            effectId,
            ...(ability.conditionType === "outfit"
              ? { outfit: monster.outfit }
              : {}),
          },
          now,
        );
      }
      return true;
    }
    const request: DamageRequest = {
      sourceId: monster.id,
      origin: "monster",
      type:
        ability.kind === "healing"
          ? "healing"
          : (ability.damageType ?? "physical"),
      minimum: ability.minimum ?? 0,
      maximum: ability.maximum ?? ability.minimum ?? 0,
      effectId,
      ignoreArmor: ability.damageType !== "physical",
      ignoreShield: ability.damageType !== "physical",
    };
    for (const creature of affected) {
      if (
        ability.kind === "damage" &&
        (creature === monster || creature.kind === "npc")
      ) {
        continue;
      }
      if (ability.kind === "healing" && creature !== monster) continue;
      if (!this.canMonsterAffect(monster, creature)) continue;
      this.applyDamage(creature, request, now);
    }
    return true;
  }

  private tickPlayerAttack(session: Session, now: number): void {
    const player = this.playerFor(session);
    const target = session.attackTargetId
      ? this.world.getCreature(session.attackTargetId)
      : undefined;
    if (!player || !target) {
      if (session.attackTargetId) this.setTarget(session, null, now);
      return;
    }
    if (!this.canPlayerTarget(session, player, target)) {
      this.setTarget(session, null, now);
      return;
    }
    const plan = this.playerAttackPlan(session, player, target);
    if (!plan) {
      this.reject(session, now);
      this.setTarget(session, null, now);
      return;
    }
    if (
      !this.isInRange(player.position, target.position, plan.range) ||
      (plan.lineOfSight &&
        !this.world.hasLineOfSight(player.position, target.position))
    ) {
      this.chaseTarget(session, player, target, now, plan.range);
      return;
    }
    if (now < player.nextAttackAt || session.itemOperationPending) return;
    if (plan.manaCost > 0 && !player.spendMana(plan.manaCost)) {
      this.reject(session, now);
      this.setTarget(session, null, now);
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
    this.setCooldown(
      session,
      "attack",
      player.progression.attackSpeedMs,
      now,
    );
    if (plan.manaCost > 0) {
      this.progression.awardMagicProgress(
        player.id,
        this.nextEventId(`wand:${player.id}`),
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
    const player = this.playerFor(session);
    const target = this.world.getCreature(plan.targetId);
    if (
      !player ||
      !target ||
      !session.knownCreatureIds.has(target.id) ||
      !this.world.canSee(player.position, target.position, session.viewRange) ||
      !this.canPlayerTarget(session, player, target) ||
      !this.isInRange(player.position, target.position, plan.range) ||
      (plan.lineOfSight &&
        !this.world.hasLineOfSight(player.position, target.position))
    ) {
      this.reject(session, now);
      return;
    }
    let landed = false;
    for (const request of plan.requests) {
      const result = this.applyDamage(target, request, now);
      landed = result.amount > 0 || landed;
      if (target.health <= 0) break;
    }
    const eventId = this.nextEventId(`attack:${player.id}`);
    this.progression.awardSkillTries(
      player.id,
      eventId,
      plan.skill,
      landed ? 2 : 1,
      now,
    );
    this.sendFightState(session, now);
  }

  private playerAttackPlan(
    session: Session,
    player: Player,
    target: Creature,
  ): PlayerAttackPlan | null {
    const equipment = this.items.combatEquipment(player.id);
    const weapon = equipment.find(
      (entry) =>
        entry.item.location.kind === "equipment" &&
        entry.item.location.slot === "weapon",
    );
    const specials = this.playerSpecials(equipment);
    const fightMultiplier = this.attackMultiplier(session.fightMode);
    if (weapon && !this.meetsItemRequirements(player, weapon.type)) {
      return null;
    }
    if (weapon?.type.weaponType === "wand") {
      const type = weapon.type;
      const damageType = this.damageTypeForElement(type.wandType);
      return {
        targetId: target.id,
        range: type.range ?? 1,
        lineOfSight: true,
        skill: "fist",
        manaCost: type.manaCost ?? 0,
        requests: [
          {
            sourceId: player.id,
            origin: "wand",
            type: damageType,
            minimum: type.minimumDamage ?? 1,
            maximum: type.maximumDamage ?? type.minimumDamage ?? 1,
            missileId: this.missileForItem(type),
            effectId: this.effectForDamage(damageType),
            ...specials,
            ignoreArmor: true,
            ignoreShield: true,
          },
        ],
      };
    }
    const weaponType = weapon?.type.weaponType;
    const distance = weaponType === "distance";
    const skill = this.skillForWeapon(weaponType);
    const vocation = getVocation(
      player.vocation,
      player.progression.definitionVersion,
    );
    let attack = weapon?.type.attack ?? 7;
    const range = distance ? (weapon?.type.range ?? 3) : 1;
    let hitChance = distance
      ? (weapon?.type.maxHitChance ?? weapon?.type.hitChance ?? 75)
      : 100;
    let missileId = distance ? this.missileForItem(weapon?.type) : undefined;
    let consume: PlayerAttackPlan["consume"];
    if (distance && weapon?.type.ammoType) {
      const ammunition = equipment.find(
        (entry) =>
          entry.item.location.kind === "equipment" &&
          entry.item.location.slot === "ammo" &&
          entry.type.weaponType === "ammunition" &&
          entry.type.ammoType === weapon.type.ammoType,
      );
      if (!ammunition || !this.meetsItemRequirements(player, ammunition.type)) {
        return null;
      }
      attack += ammunition.type.attack ?? 0;
      hitChance = ammunition.type.hitChance ?? hitChance;
      missileId = this.missileForItem(ammunition.type) ?? missileId;
      consume = {
        itemId: ammunition.item.id,
        revision: ammunition.item.version,
        reason: "ammunition",
      };
    }
    const rolled = this.formula.playerDamage({
      level: player.level,
      skill: player.skillLevel(skill),
      attack,
      vocationMultiplier: distance
        ? vocation.formulas.distanceDamage
        : vocation.formulas.meleeDamage,
      fightMultiplier,
    });
    const requests: DamageRequest[] = [
      {
        sourceId: player.id,
        origin: distance ? "distance" : "melee",
        type: "physical",
        minimum: rolled.minimum,
        maximum: rolled.maximum,
        ...(missileId ? { missileId } : {}),
        effectId: 1,
        ...specials,
        hitChance,
      },
    ];
    for (const [type, amount] of Object.entries(
      weapon?.type.elementDamage ?? {},
    )) {
      if (!amount || amount <= 0) continue;
      const damageType = this.protocolDamageType(type as CatalogDamageType);
      requests.push({
        sourceId: player.id,
        origin: distance ? "distance" : "melee",
        type: damageType,
        minimum: amount,
        maximum: amount,
        effectId: this.effectForDamage(damageType),
        ignoreArmor: true,
        ignoreShield: true,
      });
    }
    return {
      targetId: target.id,
      range,
      lineOfSight: distance,
      requests,
      skill,
      manaCost: 0,
      ...(consume ? { consume } : {}),
      ...(distance && weapon?.type.breakChance
        ? {
            breakable: {
              itemId: weapon.item.id,
              revision: weapon.item.version,
              chance: weapon.type.breakChance,
            },
          }
        : {}),
    };
  }

  private executeSpell(
    session: Session,
    spell: SpellDefinition,
    targetIntent: CombatTarget,
    now: number,
    spendResources: boolean,
  ): void {
    const player = this.playerFor(session);
    if (
      !player ||
      !this.canBeginSpell(session, player, spell, targetIntent, now)
    ) {
      this.reject(session, now);
      return;
    }
    const target = this.resolveSpellTarget(session, player, targetIntent);
    if (!target) {
      this.reject(session, now);
      return;
    }
    if (
      spendResources &&
      (!player.spendMana(spell.manaCost) ||
        !player.spendSoul(spell.soulCost))
    ) {
      this.reject(session, now);
      return;
    }
    this.setCooldown(session, spell.cooldownGroup, spell.cooldownMs, now);
    if (spendResources && spell.manaCost > 0) {
      this.progression.awardMagicProgress(
        player.id,
        this.nextEventId(`magic:${player.id}`),
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
    const values = this.formula.spellDamage({
      level: player.level,
      magicLevel: player.progression.magicLevel,
      ...spell.formula,
    });
    const affected = this.creaturesInArea(
      player.position,
      target.position,
      spell.area,
    );
    if (spell.area.shape === "single" && target.creature && affected.length === 0) {
      affected.push(target.creature);
    }
    const specials = this.playerSpecials(
      this.items.combatEquipment(player.id),
    );
    if (values.maximum > 0) {
      for (const creature of affected) {
        if (
          spell.damageType !== "healing" &&
          !this.canPlayerHarm(session, player, creature)
        ) {
          continue;
        }
        if (spell.damageType === "healing" && creature !== player) continue;
        this.applyDamage(
          creature,
          {
            sourceId: player.id,
            origin: spell.origin,
            type: spell.damageType,
            minimum: values.minimum,
            maximum: values.maximum,
            effectId: spell.effectId,
            ignoreArmor: spell.damageType !== "physical",
            ignoreShield: spell.damageType !== "physical",
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
          spell.condition.type !== "haste" &&
          spell.condition.type !== "magic-shield" &&
          spell.condition.type !== "light" &&
          spell.condition.type !== "regeneration" &&
          spell.condition.type !== "invisible" &&
          !this.canPlayerHarm(session, player, creature)
        ) {
          continue;
        }
        this.applyCondition(
          creature,
          {
            ...spell.condition,
            sourceId: player.id,
          },
          now,
        );
      }
    }
    this.sendFightState(session, now);
  }

  private canBeginSpell(
    session: Session,
    player: Player,
    spell: SpellDefinition,
    target: CombatTarget,
    now: number,
  ): boolean {
    if (
      player.conditions.has("mute") ||
      !spell.vocations.includes(player.vocation) ||
      player.level < spell.requiredLevel ||
      player.progression.magicLevel < spell.requiredMagicLevel ||
      player.mana < spell.manaCost ||
      player.progression.soul < spell.soulCost ||
      !spell.targetKinds.includes(target.kind) ||
      (session.combatCooldowns.get(spell.cooldownGroup)?.readyAt ?? 0) > now
    ) {
      return false;
    }
    const resolved = this.resolveSpellTarget(session, player, target);
    if (!resolved) return false;
    const harmful =
      spell.damageType !== "healing" ||
      (spell.condition !== undefined &&
        ![
          "haste",
          "magic-shield",
          "light",
          "regeneration",
          "invisible",
        ].includes(spell.condition.type));
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
      !this.canPlayerHarm(session, player, resolved.creature)
    ) {
      return false;
    }
    return (
      this.isInRange(player.position, resolved.position, spell.range) &&
      (!spell.lineOfSight ||
        this.world.hasLineOfSight(player.position, resolved.position))
    );
  }

  private resolveSpellTarget(
    session: Session,
    player: Player,
    target: CombatTarget,
  ): ResolvedSpellTarget | null {
    if (target.kind === "self") {
      return { position: player.position, creature: player };
    }
    if (target.kind === "position") {
      if (
        target.position.z !== player.position.z ||
        !this.world.getTile(target.position) ||
        !this.world.canSee(player.position, target.position, session.viewRange)
      ) {
        return null;
      }
      return { position: target.position, creature: null };
    }
    const creatureId =
      target.kind === "attack-target"
        ? session.attackTargetId
        : target.creatureId;
    const creature = creatureId
      ? this.world.getCreature(creatureId)
      : undefined;
    if (
      !creature ||
      !session.knownCreatureIds.has(creature.id) ||
      !this.world.canSee(player.position, creature.position, session.viewRange)
    ) {
      return null;
    }
    return { position: creature.position, creature };
  }

  private applyDamage(
    target: Creature,
    request: DamageRequest,
    now: number,
  ): DamageResult {
    if (
      target.health <= 0 ||
      (target instanceof Player && now < target.invulnerableUntil)
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
    let amount = this.formula.integer(request.minimum, request.maximum);
    const critical = this.formula.chance(request.criticalChance ?? 0);
    if (critical) {
      amount = Math.floor(
        amount * (1 + (request.criticalDamagePercent ?? 50) / 100),
      );
    }
    if (request.type === "healing") {
      const before = target.health;
      target.setHealth(target.health + amount);
      const healed = target.health - before;
      this.publishDamageResult(target, request, healed, "none");
      if (target instanceof Player && healed > 0) {
        this.progression.syncPlayer(target, now);
      }
      return {
        amount: healed,
        block: "none",
        critical,
        healthChanged: healed > 0,
        manaChanged: false,
      };
    }
    const mitigated = this.mitigate(target, request, amount);
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
        const absorbed = Math.min(target.mana, amount);
        if (absorbed > 0) {
          target.spendMana(absorbed);
          manaChanged = true;
          amount -= absorbed;
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
    const source = request.sourceId
      ? this.world.getCreature(request.sourceId)
      : undefined;
    if (target instanceof Monster && source instanceof Player && amount > 0) {
      target.recordPlayerDamage(source.id, amount);
    }
    if (target instanceof Player && (healthChanged || manaChanged)) {
      this.progression.syncPlayer(target, now);
      this.applyCombatLocks(
        target,
        source?.id ?? null,
        source instanceof Player,
        now,
      );
    }
    if (source instanceof Player && amount > 0) {
      const healthLeech = Math.floor(
        amount *
          (this.formula.chance(request.lifeLeechChance ?? 0)
            ? (request.lifeLeechPercent ?? 0)
            : 0) /
          100,
      );
      const manaLeech = Math.floor(
        amount *
          (this.formula.chance(request.manaLeechChance ?? 0)
            ? (request.manaLeechPercent ?? 0)
            : 0) /
          100,
      );
      if (healthLeech > 0) source.setHealth(source.health + healthLeech);
      if (manaLeech > 0) source.restoreMana(manaLeech);
      this.applyCombatLocks(source, target.id, target instanceof Player, now);
      if (healthLeech > 0 || manaLeech > 0) {
        this.progression.syncPlayer(source, now);
      }
    }
    if (healthChanged && target.health <= 0) {
      this.handleDeath(target, request.sourceId, now);
    }
    return {
      amount,
      block: mitigated.block,
      critical,
      healthChanged,
      manaChanged,
    };
  }

  private mitigate(
    target: Creature,
    request: DamageRequest,
    rawAmount: number,
  ): { amount: number; block: DamageResult["block"] } {
    let amount = rawAmount;
    let block: DamageResult["block"] = "none";
    if (target instanceof Monster) {
      const resistance = target.type.elements[request.type] ?? 0;
      if (resistance >= 100) return { amount: 0, block: "immunity" };
      amount = Math.max(0, Math.floor(amount * (1 - resistance / 100)));
      const stats = target.type.defenses.find(
        (ability) => ability.kind === "stats",
      );
      if (request.type === "physical") {
        if (!request.ignoreShield && (stats?.defense ?? 0) > 0) {
          amount -= this.formula.integer(0, stats?.defense ?? 0);
          if (amount <= 0) block = "shield";
        }
        if (!request.ignoreArmor && amount > 0 && (stats?.armor ?? 0) > 0) {
          amount -= this.formula.integer(
            Math.floor((stats?.armor ?? 0) / 2),
            stats?.armor ?? 0,
          );
          if (amount <= 0) block = "armor";
        }
      }
      amount -= Math.floor(stats?.mitigation ?? 0);
      return { amount: Math.max(0, amount), block };
    }
    if (target instanceof Player) {
      const equipment = this.items.combatEquipment(target.id);
      const absorbType = this.catalogDamageType(request.type);
      const absorb = equipment.reduce(
        (total, entry) =>
          total + (entry.type.absorbPercent?.[absorbType] ?? 0),
        0,
      );
      if (absorb >= 100) return { amount: 0, block: "immunity" };
      amount = Math.max(0, Math.floor(amount * (1 - absorb / 100)));
      if (request.type === "physical") {
        const session = this.registry.sessionFor(target.id);
        const defenseMultiplier = this.defenseMultiplier(
          session?.fightMode ?? {
            attack: "balanced",
            chase: true,
            secure: true,
          },
        );
        const shield = equipment.find(
          (entry) =>
            entry.item.location.kind === "equipment" &&
            entry.item.location.slot === "shield",
        );
        if (
          !request.ignoreShield &&
          shield &&
          this.formula.chance(30 * defenseMultiplier)
        ) {
          amount -= this.formula.integer(
            0,
            Math.floor((shield.type.defense ?? 0) * defenseMultiplier),
          );
          if (amount <= 0) block = "shield";
        }
        const armor = equipment.reduce(
          (total, entry) => total + (entry.type.armor ?? 0),
          0,
        );
        if (!request.ignoreArmor && amount > 0 && armor > 0) {
          amount -= this.formula.integer(
            Math.floor(armor / 2),
            Math.floor(armor * defenseMultiplier),
          );
          if (amount <= 0) block = "armor";
        }
      }
    }
    return { amount: Math.max(0, amount), block };
  }

  private publishDamageResult(
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

  private applyCondition(
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
    target.conditions.apply(application, now);
    if (application.effectId) {
      this.visibility.broadcastMagicEffect(
        target.position,
        application.effectId,
        target.id,
      );
    }
    this.visibility.onCreatureStateChanged(target);
    if (target instanceof Player) {
      this.sendFightStateForPlayer(target.id, now);
      this.registry.sessionFor(target.id)?.send({
        type: "combat-log",
        kind: "condition",
        text: `${application.type} applied.`,
      });
    }
    return true;
  }

  private tickConditions(now: number): void {
    for (const creature of [...this.world.allCreatures()]) {
      const result = creature.conditions.tick(now);
      for (const effect of result.effects) {
        this.applyDamage(
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
      this.visibility.onCreatureStateChanged(creature);
      if (creature instanceof Player) {
        this.sendFightStateForPlayer(creature.id, now);
      }
    }
  }

  private handleDeath(
    target: Creature,
    sourceId: string | null,
    now: number,
  ): void {
    if (!target.claimDeath()) return;
    if (target instanceof Monster) {
      const killerId =
        (sourceId && this.world.getPlayer(sourceId)?.id) ??
        target.topDamagerId();
      if (killerId && target.type.experience > 0) {
        this.progression.awardExperience(
          killerId,
          `death:${target.id}`,
          target.type.experience,
          now,
        );
        this.registry.sessionFor(killerId)?.send({
          type: "combat-log",
          kind: "experience",
          text: `You gained ${target.type.experience} experience.`,
        });
      }
      this.createMonsterCorpse(target, killerId, now);
      if (!this.onMonsterDeath(target, now)) {
        this.world.removeCreature(target.id);
        this.visibility.announceCreatureLeave(target);
      }
      return;
    }
    if (!(target instanceof Player)) return;
    const session = this.registry.sessionFor(target.id);
    target.conditions.clear();
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
      this.sendFightState(other, now);
    }
    this.progression.syncPlayer(target, now, true);
    this.visibility.broadcastHealth(target);
    this.visibility.onCreatureStateChanged(target);
    session?.send({
      type: "combat-log",
      kind: "death",
      text: "You died and returned to the temple.",
    });
    if (session) this.sendFightState(session, now);
  }

  private createMonsterCorpse(
    monster: Monster,
    killerId: string | null,
    _now: number,
  ): void {
    const corpseType = this.items.itemType(monster.type.corpseItemTypeId);
    if (!corpseType || (corpseType.containerCapacity ?? 0) < 1) return;
    const loot: LootItemCreation[] = [];
    for (const entry of monster.type.loot) {
      if (!this.formula.chance(entry.chance / 1_000)) continue;
      const type =
        (entry.itemTypeId
          ? this.items.itemType(entry.itemTypeId)
          : undefined) ??
        (entry.itemName
          ? this.items.itemTypeByName(entry.itemName)
          : undefined);
      if (!type) continue;
      loot.push({
        typeId: type.id,
        count: Math.min(
          type.maxCount,
          this.formula.integer(1, entry.maxCount),
        ),
      });
      if (loot.length >= (corpseType.containerCapacity ?? 0)) break;
    }
    const stackIndex = Math.min(
      255,
      this.world
        .getMapItems(monster.position)
        .reduce((highest, item) => Math.max(highest, item.stackIndex), -1) + 1,
    );
    this.items.createCorpse(
      killerId,
      `death:${monster.id}`,
      monster.position,
      stackIndex,
      corpseType.id,
      loot,
    );
  }

  private applyCombatLocks(
    player: Player,
    sourceId: string | null,
    pzLocked: boolean,
    now: number,
  ): void {
    player.conditions.apply(
      {
        type: "combat-lock",
        sourceId,
        durationMs: COMBAT_LOCK_MS,
      },
      now,
    );
    if (pzLocked) {
      player.conditions.apply(
        {
          type: "pz-lock",
          sourceId,
          durationMs: COMBAT_LOCK_MS,
        },
        now,
      );
    }
    this.sendFightStateForPlayer(player.id, now);
  }

  private creaturesInArea(
    origin: Position,
    center: Position,
    area: SpellDefinition["area"] | MonsterAbility["area"],
  ): Creature[] {
    const positions = this.areaPositions(origin, center, area);
    const creatures = new Map<string, Creature>();
    for (const position of positions) {
      if (
        !this.world.getTile(position) ||
        !this.world.hasLineOfSight(origin, position)
      ) {
        continue;
      }
      for (const creature of this.world.creaturesAt(position)) {
        creatures.set(creature.id, creature);
      }
    }
    return [...creatures.values()];
  }

  private areaPositions(
    origin: Position,
    center: Position,
    area: SpellDefinition["area"] | MonsterAbility["area"],
  ): Position[] {
    if (area.shape === "single") return [{ ...center }];
    if (area.shape === "circle") {
      const radius = area.radius ?? 1;
      const positions: Position[] = [];
      for (let y = center.y - radius; y <= center.y + radius; y++) {
        for (let x = center.x - radius; x <= center.x + radius; x++) {
          if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) > radius) {
            continue;
          }
          positions.push({ x, y, z: center.z });
        }
      }
      return positions;
    }
    const direction = this.directionToward(origin, center);
    const [forwardX, forwardY] = this.directionDelta(direction);
    const [sideX, sideY] = [-forwardY, forwardX];
    const length = area.length ?? 1;
    const spread = area.spread ?? 1;
    const positions: Position[] = [];
    for (let distance = 1; distance <= length; distance++) {
      const halfWidth =
        area.shape === "cone"
          ? Math.floor(((spread - 1) * distance) / Math.max(1, length) / 2)
          : 0;
      for (let side = -halfWidth; side <= halfWidth; side++) {
        positions.push({
          x: origin.x + forwardX * distance + sideX * side,
          y: origin.y + forwardY * distance + sideY * side,
          z: origin.z,
        });
      }
    }
    return positions;
  }

  private chaseTarget(
    session: Session,
    player: Player,
    target: Creature,
    now: number,
    range: number,
  ): void {
    if (
      !session.fightMode.chase ||
      session.movementDirection ||
      now < player.nextStepAt
    ) {
      return;
    }
    const path = findPath({
      start: player.position,
      isGoal: (position) => this.isInRange(position, target.position, range),
      canStep: (position) =>
        position.z === player.position.z &&
        this.world.isPathable(position) &&
        !this.world.isOccupied(position),
      maxVisited: PLAYER_CHASE_PATH_BUDGET,
    });
    const direction = path.directions[0];
    if (!direction) return;
    const result = this.world.tryMoveCreature(player, direction, now);
    this.publishChaseMovement(session, player, result);
  }

  private publishChaseMovement(
    session: Session,
    player: Player,
    result: MoveResult,
  ): void {
    if (result.moved) {
      this.persistence.markDirty(player);
      this.visibility.onPlayerStepped(
        session,
        player,
        result.from,
        result.durationMs,
      );
    } else if (result.turned) {
      this.persistence.markDirty(player);
      this.visibility.broadcastPose(player);
    }
  }

  private canPlayerTarget(
    session: Session,
    player: Player,
    target: Creature,
  ): boolean {
    if (
      target.id === player.id ||
      target.health <= 0 ||
      target.conditions.has("invisible") ||
      target.position.z !== player.position.z
    ) {
      return false;
    }
    if (target instanceof Monster) {
      return (
        target.type.flags.attackable &&
        !this.world.isProtectionZone(player.position) &&
        !this.world.isProtectionZone(target.position)
      );
    }
    return (
      target instanceof Player &&
      !session.fightMode.secure &&
      !this.world.isProtectionZone(player.position) &&
      !this.world.isProtectionZone(target.position) &&
      !this.world.isNoPvpZone(player.position) &&
      !this.world.isNoPvpZone(target.position)
    );
  }

  private canPlayerHarm(
    session: Session,
    player: Player,
    target: Creature,
  ): boolean {
    if (
      target === player ||
      target.kind === "npc" ||
      target.health <= 0 ||
      this.world.getCreature(target.id) !== target
    ) {
      return false;
    }
    if (target instanceof Monster) {
      return (
        target.type.flags.attackable &&
        !this.world.isProtectionZone(player.position) &&
        !this.world.isProtectionZone(target.position)
      );
    }
    return this.canPlayerTarget(session, player, target);
  }

  private canMonsterAffect(monster: Monster, target: Creature): boolean {
    return (
      !(target instanceof Player) ||
      (!this.world.isProtectionZone(monster.position) &&
        !this.world.isProtectionZone(target.position))
    );
  }

  private playerFor(session: Session): Player | null {
    return session.playerId
      ? (this.world.getPlayer(session.playerId) ?? null)
      : null;
  }

  private setTarget(
    session: Session,
    creatureId: string | null,
    now: number,
  ): void {
    session.attackTargetId = creatureId;
    session.send({ type: "attack-target-changed", creatureId });
    this.sendFightState(session, now);
  }

  private reject(session: Session, now: number): void {
    session.sendError("combat-action-failed");
    this.sendFightState(session, now);
  }

  private sendFightState(session: Session, now: number): void {
    for (const [group, cooldown] of session.combatCooldowns) {
      if (cooldown.readyAt <= now) session.combatCooldowns.delete(group);
    }
    session.send({
      type: "fight-state",
      fightState: projectFightState(session, this.world, now),
    });
  }

  private sendFightStateForPlayer(playerId: string, now: number): void {
    const session = this.registry.sessionFor(playerId);
    if (session) this.sendFightState(session, now);
  }

  private setCooldown(
    session: Session,
    group: string,
    totalMs: number,
    now: number,
  ): void {
    session.combatCooldowns.set(group, {
      readyAt: now + totalMs,
      totalMs,
    });
  }

  private isInRange(from: Position, to: Position, range: number): boolean {
    return (
      from.z === to.z &&
      Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) <= range
    );
  }

  private meetsItemRequirements(player: Player, item: ItemType): boolean {
    return (
      (item.requirements?.level === undefined ||
        player.level >= item.requirements.level) &&
      (!item.requirements?.vocations ||
        item.requirements.vocations.includes(player.vocation))
    );
  }

  private playerSpecials(
    equipment: ReadonlyArray<{ item: unknown; type: ItemType }>,
  ): PlayerSpecials {
    const criticalChance =
      equipment.reduce(
        (total, entry) => total + (entry.type.criticalHitChance ?? 0),
        0,
      ) / 100;
    const criticalDamagePercent =
      50 +
      equipment.reduce(
        (total, entry) => total + (entry.type.criticalHitDamage ?? 0),
        0,
      ) /
        100;
    const lifeLeechPercent =
      equipment.reduce(
        (total, entry) => total + (entry.type.lifeLeechAmount ?? 0),
        0,
      ) / 100;
    const manaLeechPercent =
      equipment.reduce(
        (total, entry) => total + (entry.type.manaLeechAmount ?? 0),
        0,
      ) / 100;
    return {
      criticalChance,
      criticalDamagePercent,
      lifeLeechChance: equipment.reduce(
        (total, entry) => total + (entry.type.lifeLeechChance ?? 0),
        0,
      ),
      lifeLeechPercent,
      manaLeechChance: equipment.reduce(
        (total, entry) => total + (entry.type.manaLeechChance ?? 0),
        0,
      ),
      manaLeechPercent,
    };
  }

  private skillForWeapon(weaponType: string | undefined): Skill {
    if (weaponType === "club") return "club";
    if (weaponType === "sword") return "sword";
    if (weaponType === "axe") return "axe";
    if (weaponType === "distance") return "distance";
    return "fist";
  }

  private damageTypeForElement(element: string | undefined): DamageType {
    if (element === "energy") return "energy";
    if (element === "earth") return "earth";
    if (element === "fire") return "fire";
    if (element === "ice") return "ice";
    if (element === "holy") return "holy";
    if (element === "death") return "death";
    return "physical";
  }

  private protocolDamageType(type: CatalogDamageType): DamageType {
    if (type === "lifedrain") return "life-drain";
    if (type === "manadrain") return "mana-drain";
    if (type === "poison") return "earth";
    return type;
  }

  private catalogDamageType(type: DamageType): CatalogDamageType {
    if (type === "life-drain") return "lifedrain";
    if (type === "mana-drain") return "manadrain";
    if (type === "healing") return "physical";
    return type;
  }

  private effectForDamage(type: DamageType): number {
    if (type === "energy") return 12;
    if (type === "earth") return 17;
    if (type === "fire") return 16;
    if (type === "ice") return 44;
    if (type === "holy") return 40;
    if (type === "death") return 18;
    if (type === "healing") return 13;
    return 1;
  }

  private missileForItem(type: ItemType | undefined): number | undefined {
    if (!type?.shootType) return undefined;
    return getMissileId(`CONST_ANI_${type.shootType.toUpperCase()}`);
  }

  private attackMultiplier(mode: FightMode): number {
    if (mode.attack === "offensive") return 1.15;
    if (mode.attack === "defensive") return 0.8;
    return 1;
  }

  private defenseMultiplier(mode: FightMode): number {
    if (mode.attack === "defensive") return 1.2;
    if (mode.attack === "offensive") return 0.85;
    return 1;
  }

  private directionToward(from: Position, to: Position): Direction {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "east" : "west";
    return dy >= 0 ? "south" : "north";
  }

  private directionDelta(direction: Direction): readonly [number, number] {
    if (direction === "north") return [0, -1];
    if (direction === "east") return [1, 0];
    if (direction === "south") return [0, 1];
    return [-1, 0];
  }

  private nextEventId(prefix: string): string {
    this.eventSequence++;
    return `${prefix}:${this.eventSequence}`;
  }
}
