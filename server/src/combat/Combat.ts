import type {
  CastSpellMessage,
  SetFightModeMessage,
  UseRuneMessage,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Monster } from "../creature/Monster";
import type { MonsterAbility } from "../creature/MonsterType";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { canMonsterAffect } from "./canMonsterAffect";
import { canPlayerTarget } from "./canPlayerTarget";
import { ChaseController } from "./ChaseController";
import { CombatFeedback } from "./CombatFeedback";
import { MISSILE_DURATION_MS } from "./combatConstants";
import { CombatFormula } from "./CombatFormula";
import { ConditionSystem } from "./ConditionSystem";
import { creaturesInArea } from "./creaturesInArea";
import type { DamageRequest } from "./Damage";
import { DamageResolver } from "./DamageResolver";
import { DeathHandler } from "./DeathHandler";
import { EventSequence } from "./EventSequence";
import { getMagicEffectId } from "./getMagicEffectId";
import { getMissileId } from "./getMissileId";
import { isInRange } from "./isInRange";
import { PlayerAutoAttack } from "./PlayerAutoAttack";
import { playerForSession } from "./playerForSession";
import { SpellCaster } from "./SpellCaster";
import { SpellRegistry } from "./SpellRegistry";

export class Combat {
  private readonly spells: SpellRegistry;
  private readonly feedback: CombatFeedback;
  private readonly damage: DamageResolver;
  private readonly conditionSystem: ConditionSystem;
  private readonly spellCaster: SpellCaster;
  private readonly autoAttack: PlayerAutoAttack;

  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    persistence: CharacterPersistence,
    progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    seed: number,
    onMonsterDeath: (monster: Monster, now: number) => boolean,
    spells = new SpellRegistry(),
  ) {
    this.spells = spells;
    const formula = new CombatFormula(seed);
    const sequence = new EventSequence();
    this.feedback = new CombatFeedback(world, registry);
    const death = new DeathHandler(
      world,
      visibility,
      registry,
      progression,
      items,
      formula,
      this.feedback,
      onMonsterDeath,
    );
    this.damage = new DamageResolver(
      world,
      visibility,
      registry,
      progression,
      items,
      formula,
      this.feedback,
      sequence,
      death,
    );
    this.conditionSystem = new ConditionSystem(
      world,
      visibility,
      registry,
      this.feedback,
      this.damage,
    );
    this.spellCaster = new SpellCaster(
      world,
      visibility,
      persistence,
      progression,
      items,
      this.feedback,
      sequence,
      this.damage,
      this.conditionSystem,
    );
    const chase = new ChaseController(world, visibility, persistence);
    this.autoAttack = new PlayerAutoAttack(
      world,
      progression,
      items,
      formula,
      this.feedback,
      sequence,
      this.damage,
      chase,
    );
  }

  selectTarget(session: Session, creatureId: string, now: number): void {
    const player = playerForSession(this.world, session);
    const target = this.world.getCreature(creatureId);
    if (
      !player ||
      !target ||
      !session.knownCreatureIds.has(target.id) ||
      !this.world.canSee(player.position, target.position, session.viewRange) ||
      !canPlayerTarget(this.world, session, player, target)
    ) {
      this.feedback.reject(session, now);
      return;
    }
    this.feedback.setTarget(session, target.id, now);
  }

  cancelTarget(session: Session, now: number): void {
    if (!playerForSession(this.world, session)) {
      session.sendError("join-required");
      return;
    }
    this.feedback.setTarget(session, null, now);
  }

  setFightMode(
    session: Session,
    intent: SetFightModeMessage,
    now: number,
  ): void {
    if (!playerForSession(this.world, session)) {
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
    this.feedback.sendFightState(session, now);
  }

  castSpell(
    session: Session,
    intent: CastSpellMessage,
    now: number,
  ): void {
    const spell = this.spells.get(intent.spellId);
    if (!spell || spell.origin !== "spell") {
      this.feedback.reject(session, now);
      return;
    }
    if (spell.conjure) {
      this.spellCaster.executeConjure(session, spell, intent.target, now);
      return;
    }
    this.spellCaster.executeSpell(session, spell, intent.target, now, true);
  }

  useRune(session: Session, intent: UseRuneMessage, now: number): void {
    const player = playerForSession(this.world, session);
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
      !this.spellCaster.canBeginSpell(session, player, spell, intent.target, now)
    ) {
      this.feedback.reject(session, now);
      return;
    }
    this.items.consumeForCombat(
      session,
      intent.itemId,
      intent.revision,
      "rune",
      (committedAt) => {
        this.spellCaster.executeSpell(
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
    for (const creature of this.world.allCreatures()) {
      creature.tickDefense(now);
    }
    this.conditionSystem.tick(now);
    for (const session of this.registry.all()) {
      this.autoAttack.tickPlayerAttack(session, now);
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
      (!isInRange(monster.position, resolvedTarget.position, ability.range) ||
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
        : creaturesInArea(this.world, monster.position, center, ability.area);
    if (ability.kind === "condition" && ability.conditionType) {
      for (const creature of affected) {
        if (creature === monster && ability.target !== "self") continue;
        if (!canMonsterAffect(this.world, monster, creature)) continue;
        this.conditionSystem.applyCondition(
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
      if (!canMonsterAffect(this.world, monster, creature)) continue;
      this.damage.applyDamage(creature, request, now);
    }
    return true;
  }
}
