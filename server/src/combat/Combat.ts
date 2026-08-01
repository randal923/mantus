import type {
  ActionBotAction,
  ActivateActionBarMessage,
  CastSpellMessage,
  CombatTarget,
  Direction,
  Position,
  SetFightModeMessage,
  UseItemWithMessage,
  UsePotionMessage,
  UseRuneMessage,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import type { MonsterAbility } from "../creature/MonsterType";
import type { MonsterEventHooks } from "../creature/MonsterEventHooks";
import type { BestiaryHooks } from "../bestiary/BestiaryHooks";
import type { GuildHooks } from "../guild/GuildHooks";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PartyHooks } from "../party/PartyHooks";
import type { BoostedHooks } from "../boosted/BoostedHooks";
import type { PreyHooks } from "../prey/PreyHooks";
import type { ProficiencyHooks } from "../proficiency/ProficiencyHooks";
import { Player } from "../Player";
import type { PvpHooks } from "../pvp/PvpHooks";
import type { RewardHooks } from "../reward/RewardHooks";
import { PotionService } from "../potion/PotionService";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { positionKey } from "../positionKey";
import { areaPositions } from "./areaPositions";
import { canMonsterAffect } from "./canMonsterAffect";
import { canPlayerTarget } from "./canPlayerTarget";
import { ChaseController } from "./ChaseController";
import { CombatFeedback } from "./CombatFeedback";
import {
  COMBAT_ANALYZER_INTERVAL_MS,
  MISSILE_DURATION_MS,
} from "./combatConstants";
import { CombatFormula } from "./CombatFormula";
import { ConditionSystem } from "./ConditionSystem";
import { creaturesInArea } from "./creaturesInArea";
import { directionDelta } from "./directionDelta";
import { directionToward } from "./directionToward";
import type { DamageRequest } from "./Damage";
import { DamageResolver } from "./DamageResolver";
import { DeathHandler } from "./DeathHandler";
import { EventSequence } from "./EventSequence";
import { findVisiblePlayerByName } from "./findVisiblePlayerByName";
import { getMagicEffectId } from "./getMagicEffectId";
import { GIFT_OF_LIFE_STORAGE_KEY } from "./giftOfLife";
import { getMissileId } from "./getMissileId";
import { isInRange } from "./isInRange";
import { PlayerAutoAttack } from "./PlayerAutoAttack";
import { CONJURED_FOOD_TYPE_IDS } from "./conjuredFoodTypeIds";
import { playerForSession } from "./playerForSession";
import { playerTierBonuses } from "./playerTierBonuses";
import { PlayerSpellActions } from "./PlayerSpellActions";
import { projectCombatAnalyzer } from "./projectCombatAnalyzer";
import type { SpellDefinition } from "./Spell";
import { SpellCaster } from "./SpellCaster";
import { SpellRegistry } from "./SpellRegistry";
import type { SpokenSpellOutcome } from "./SpokenSpellOutcome";
import type { TargetingHooks } from "./TargetingHooks";
import type { WorldSpellHooks } from "./WorldSpellHooks";
import { ActionBot } from "./ActionBot";
import { selectAutoTarget } from "../huntingBot/selectAutoTarget";
import { getPotionDefinition } from "../potion/getPotionDefinition";
import { getSpellActionTargetMode } from "./getSpellActionTargetMode";
import { drainDue } from "../drainDue";

/** Spell target kinds whose spoken parameter names a creature to cast at. */
const TARGETED_SPELL_KINDS = new Set<SpellDefinition["targetKind"]>([
  "target",
  "target-or-direction",
]);

const CRITICAL_DAMAGE_EFFECT_ID = 173;

/**
 * How often the hunting bot re-picks its target. Slow enough that a running
 * fight is not interrupted by every passing rat, fast enough that a fresh
 * wounded monster is picked up promptly.
 */
const HUNTING_BOT_TARGET_INTERVAL_MS = 1_000;

const FEAR_DIRECTIONS: ReadonlyArray<readonly [Direction, number, number]> = [
  ["north", 0, -1],
  ["northeast", 1, -1],
  ["east", 1, 0],
  ["southeast", 1, 1],
  ["south", 0, 1],
  ["southwest", -1, 1],
  ["west", -1, 0],
  ["northwest", -1, -1],
];

export class Combat {
  private readonly lastFieldCheckByCreature = new WeakMap<
    Creature,
    { readonly positionRevision: number; readonly fieldRevision: number }
  >();
  private readonly spells: SpellRegistry;
  private readonly feedback: CombatFeedback;
  private readonly damage: DamageResolver;
  private readonly conditionSystem: ConditionSystem;
  private readonly spellCaster: SpellCaster;
  private readonly autoAttack: PlayerAutoAttack;
  private readonly potions: PotionService;
  private readonly actionBot: ActionBot;
  private readonly chase: ChaseController;
  private readonly playerActions: PlayerSpellActions;
  private readonly formula: CombatFormula;
  /**
   * Set once the spawn runtime exists (it is constructed after combat).
   * Challenge and summon spells fail closed while it is absent.
   */
  private targeting: TargetingHooks | null = null;
  private readonly queuedMonsterAbilities: Array<{
    readonly executeAt: number;
    readonly monsterId: string;
    readonly targetId: string;
    readonly ability: MonsterAbility;
    readonly targetAlreadyValidated?: boolean;
    readonly pathOrigin?: Position;
  }> = [];
  private readonly queuedTeleports: Array<{
    readonly executeAt: number;
    readonly playerId: string;
    readonly position: Position;
  }> = [];
  private readonly lastFieldByCreature = new WeakMap<Creature, string>();
  private readonly nextGiftOfLifeTickAt = new WeakMap<Player, number>();
  private readonly nextMomentumRollAt = new WeakMap<Player, number>();
  /** Next tick at which the hunting bot may re-pick a target, per session. */
  private readonly nextHuntingBotTargetAt = new WeakMap<Session, number>();

  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly registry: SessionRegistry,
    private readonly persistence: CharacterPersistence,
    progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    seed: number,
    onMonsterDeath: (monster: Monster, now: number) => boolean,
    spells = new SpellRegistry(),
    private readonly partyHooks?: PartyHooks,
    guildHooks?: GuildHooks,
    private readonly pvpHooks?: PvpHooks,
    experienceRate = 1,
    lootRate = 1,
    bestiaryHooks?: BestiaryHooks,
    private readonly monsterEventHooks?: MonsterEventHooks,
    private readonly useItemWith?: (
      session: Session,
      intent: UseItemWithMessage,
      now: number,
    ) => boolean,
    private readonly worldSpells?: WorldSpellHooks,
    staminaSystem = false,
    useStages = false,
    preyHooks?: PreyHooks,
    boostedHooks?: BoostedHooks,
    animusHooks?: {
      multiplierFor(recipientId: string, monster: Monster): number;
    },
    private readonly proficiencyHooks?: ProficiencyHooks,
    deathHistoryHooks?: {
      record(characterId: string, level: number, cause: string): void;
    },
    rewardHooks?: RewardHooks,
    dailyHooks?: {
      xpBoostPercent(recipientId: string, nowMs: number): number;
    },
  ) {
    this.spells = spells;
    this.formula = new CombatFormula(seed);
    const sequence = new EventSequence();
    this.feedback = new CombatFeedback(world, registry);
    const death = new DeathHandler(
      world,
      visibility,
      registry,
      progression,
      items,
      this.formula,
      this.feedback,
      onMonsterDeath,
      partyHooks,
      guildHooks,
      pvpHooks,
      experienceRate,
      lootRate,
      bestiaryHooks,
      monsterEventHooks,
      staminaSystem,
      useStages,
      preyHooks,
      boostedHooks,
      animusHooks,
      deathHistoryHooks,
      rewardHooks,
      dailyHooks,
    );
    this.damage = new DamageResolver(
      world,
      visibility,
      registry,
      progression,
      items,
      this.formula,
      this.feedback,
      sequence,
      death,
      partyHooks,
      pvpHooks,
      monsterEventHooks,
      preyHooks,
      proficiencyHooks,
      rewardHooks,
    );
    this.conditionSystem = new ConditionSystem(
      world,
      visibility,
      registry,
      this.feedback,
      this.damage,
    );
    this.conditionSystem.setVibrancyHook({
      paralysisRemoveChancePercent: (characterId) =>
        items.imbuementEffects(characterId).paralysisRemoveChancePercent,
      pvpDeflect: (characterId) =>
        items.imbuementEffects(characterId).paralysisPvpDeflect,
      roll: (percent) => percent > 0 && this.formula.chance(percent),
    });
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
      pvpHooks,
      partyHooks,
      this.formula,
      (runeItemTypeId) => this.spells.conjuringSpellFor(runeItemTypeId),
    );
    this.playerActions = new PlayerSpellActions(
      world,
      visibility,
      registry,
      this.feedback,
      this.conditionSystem,
    );
    const chase = new ChaseController(world, visibility, persistence);
    this.chase = chase;
    this.autoAttack = new PlayerAutoAttack(
      world,
      progression,
      items,
      this.formula,
      this.feedback,
      sequence,
      this.damage,
      chase,
      pvpHooks,
      proficiencyHooks,
    );
    this.potions = new PotionService(
      world,
      visibility,
      persistence,
      progression,
      items,
      this.formula,
      registry,
      partyHooks,
    );
    this.actionBot = new ActionBot(
      world,
      (session, action, target, now) =>
        this.activateAutomaticAction(session, action, target, now),
      (session, action, now) =>
        this.deactivateAction(session, action, now),
      (session, spellId, now) =>
        this.activateAutomaticSpell(session, spellId, now),
    );
  }

  attachTargeting(targeting: TargetingHooks): void {
    this.targeting = targeting;
    this.playerActions.attachTargeting(targeting);
  }

  selectTarget(session: Session, creatureId: string, now: number): void {
    const player = playerForSession(this.world, session);
    const target = this.world.getCreature(creatureId);
    if (
      !player ||
      !target ||
      !session.knownCreatureIds.has(target.id) ||
      !this.world.canSee(player.position, target.position, session.viewRange) ||
      !canPlayerTarget(this.world, session, player, target, this.pvpHooks)
    ) {
      this.feedback.reject(session, now);
      return;
    }
    session.pendingManualActionBarActivation = null;
    this.feedback.setFollowTarget(session, null);
    this.feedback.setTarget(session, target.id, now);
  }

  cancelTarget(session: Session, now: number): void {
    if (!playerForSession(this.world, session)) {
      session.sendError("join-required");
      return;
    }
    session.pendingManualActionBarActivation = null;
    this.feedback.setTarget(session, null, now);
  }

  /**
   * Follow is a bounded intent: the client names a creature it can already
   * see, and the server owns the resulting movement. Canary clears the attack
   * target when a follow starts, so the two modes never fight over stepping.
   */
  followCreature(session: Session, creatureId: string, now: number): void {
    const player = playerForSession(this.world, session);
    const target = this.world.getCreature(creatureId);
    if (
      !player ||
      !target ||
      target.id === player.id ||
      !session.knownCreatureIds.has(target.id) ||
      !this.world.canSee(player.position, target.position, session.viewRange)
    ) {
      this.feedback.reject(session, now);
      return;
    }
    session.pendingManualActionBarActivation = null;
    if (session.attackTargetId) this.feedback.setTarget(session, null, now);
    this.feedback.setFollowTarget(session, target.id);
  }

  cancelFollow(session: Session, now: number): void {
    if (!playerForSession(this.world, session)) {
      session.sendError("join-required");
      return;
    }
    this.feedback.setFollowTarget(session, null);
  }

  /**
   * Replaces the session's aim-at-target spell set. Unknown ids and spells the
   * character cannot cast are dropped rather than stored, so the persisted set
   * can never be used to smuggle arbitrary strings into the character row.
   */
  sanitizeAimAtTargetSpells(
    player: Player,
    spellIds: ReadonlyArray<string>,
  ): ReadonlyArray<string> {
    const allowed = new Set<string>();
    for (const spellId of spellIds) {
      const spell = this.spells.get(spellId);
      if (
        !spell ||
        spell.origin !== "spell" ||
        !spell.vocations.includes(player.vocation)
      ) {
        continue;
      }
      allowed.add(spell.id);
    }
    return [...allowed];
  }

  resetCombatAnalyzer(session: Session, now: number): void {
    const player = playerForSession(this.world, session);
    if (!player) {
      session.sendError("join-required");
      return;
    }
    player.analyzer.reset(now);
    this.sendCombatAnalyzer(session, now);
  }

  sendCombatAnalyzer(session: Session, now: number): void {
    const player = playerForSession(this.world, session);
    if (!player) return;
    session.send({
      type: "combat-analyzer",
      analyzer: projectCombatAnalyzer(this.world, player, now, this.partyHooks),
    });
  }

  setFightMode(
    session: Session,
    intent: SetFightModeMessage,
    now: number,
  ): boolean {
    const player = playerForSession(this.world, session);
    if (!player) {
      session.sendError("join-required");
      return false;
    }
    session.fightMode = { ...intent.mode };
    const target = session.attackTargetId
      ? this.world.getCreature(session.attackTargetId)
      : undefined;
    if (
      target instanceof Player &&
      session.fightMode.secure &&
      !canPlayerTarget(this.world, session, player, target, this.pvpHooks)
    ) {
      session.attackTargetId = null;
      session.send({ type: "attack-target-changed", creatureId: null });
    }
    this.feedback.sendFightState(session, now);
    return true;
  }

  /** Reports whether the spell was cast; a false result was rejected. */
  castSpell(
    session: Session,
    intent: CastSpellMessage,
    now: number,
  ): boolean {
    const spell = this.spells.get(intent.spellId);
    if (!spell || spell.origin !== "spell") {
      this.feedback.reject(session, now, "spell-unavailable");
      return false;
    }
    const parameter = intent.parameter ?? null;
    if (spell.worldAction) {
      return this.castWorldActionSpell(session, spell, parameter, now);
    }
    if (spell.playerAction === "conjure-random-food") {
      return this.spellCaster.executeConjure(
        session,
        spell,
        intent.target,
        now,
        this.rollConjuredFood(),
      );
    }
    if (spell.playerAction) {
      return this.spellCaster.executeWorldSpell(
        session,
        spell,
        now,
        (player) =>
          this.playerActions.execute(session, player, spell, parameter, now),
        intent.target,
      );
    }
    if (spell.conjure) {
      return this.spellCaster.executeConjure(
        session,
        spell,
        intent.target,
        now,
      );
    }
    return this.spellCaster.executeSpell(
      session,
      spell,
      intent.target,
      now,
      true,
    );
  }

  /**
   * Canary's food spell rolls one or two random foods. Both rolls happen
   * server-side with the tick's seeded RNG before the single atomic conjure.
   */
  private rollConjuredFood(): SpellDefinition["conjure"] {
    const typeId =
      CONJURED_FOOD_TYPE_IDS[
        this.formula.integer(0, CONJURED_FOOD_TYPE_IDS.length - 1)
      ] ?? CONJURED_FOOD_TYPE_IDS[0];
    return {
      sourceItemTypeId: 0,
      targetItemTypeId: typeId,
      count: this.formula.chance(50) ? 2 : 1,
    };
  }

  /**
   * Spoken spell words ("exura") arrive through chat; the text only selects
   * the spell — vocation, level, mana, and cooldowns are all re-checked by
   * the regular cast pipeline at execution time.
   */
  castSpellByWords(
    session: Session,
    text: string,
    now: number,
  ): SpokenSpellOutcome {
    const match = this.spells.matchWords(text);
    if (!match) return "no-match";
    const { spell, parameter } = match;
    session.actionBotSuppressedAt = now;
    if (spell.worldAction) {
      return this.castWorldActionSpell(session, spell, parameter, now)
        ? "cast"
        : "rejected";
    }
    let target: CombatTarget;
    if (parameter !== null && !spell.playerAction) {
      // Canary only reads a spoken parameter as a name for its needTarget
      // spells; on any other spell the leftover words never match a spell at
      // all, so the line stays ordinary speech.
      if (!TARGETED_SPELL_KINDS.has(spell.targetKind)) return "no-match";
      const named = this.spokenNameTarget(session, spell, parameter, now);
      if (!named) return "rejected";
      target = named;
    } else {
      target = this.spokenSpellTarget(session, spell);
    }
    return this.castSpell(
      session,
      {
        type: "cast-spell",
        spellId: spell.id,
        target,
        ...(parameter !== null && spell.playerAction ? { parameter } : {}),
      },
      now,
    )
      ? "cast"
      : "rejected";
  }

  /**
   * Resolves a spoken name parameter ('exura sio "Friend"') to a creature
   * target. The lookup runs here inside the tick against players this session
   * can already see, and the cast pipeline re-checks visibility again when it
   * resolves the target, so an off-screen name can never be confirmed by a
   * successful cast (charter rules 4 and 6).
   */
  private spokenNameTarget(
    session: Session,
    spell: SpellDefinition,
    parameter: string,
    now: number,
  ): CombatTarget | null {
    const player = playerForSession(this.world, session);
    const named = player
      ? findVisiblePlayerByName(
          this.world,
          this.registry,
          session,
          player,
          parameter,
          spell.range,
        )
      : null;
    if (!named) {
      this.feedback.reject(session, now, "spell-parameter-invalid");
      return null;
    }
    return { kind: "creature", creatureId: named.id };
  }

  private castWorldActionSpell(
    session: Session,
    spell: SpellDefinition,
    parameter: string | null,
    now: number,
  ): boolean {
    return this.spellCaster.executeWorldSpell(session, spell, now, () => {
      if (spell.worldAction === "magic-rope") {
        return this.worldSpells?.magicRope(session, now) ?? false;
      }
      if (parameter !== "up" && parameter !== "down") return false;
      return this.worldSpells?.levitate(session, parameter, now) ?? false;
    });
  }

  private spokenSpellTarget(
    session: Session,
    spell: SpellDefinition,
  ): CombatTarget {
    if (spell.targetKind === "self") return { kind: "self" };
    if (spell.targetKind === "direction") return { kind: "direction" };
    if (spell.targetKind === "target-or-direction") {
      return session.attackTargetId
        ? { kind: "attack-target" }
        : { kind: "direction" };
    }
    if (spell.targetKind === "position") {
      return (
        this.automaticTarget(session, true) ?? { kind: "attack-target" }
      );
    }
    return { kind: "attack-target" };
  }

  useRune(session: Session, intent: UseRuneMessage, now: number): boolean {
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
      return false;
    }
    return this.items.consumeForCombat(
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

  usePotion(session: Session, intent: UsePotionMessage, now: number): void {
    this.potions.use(session, intent, now);
  }

  activateActionBar(
    session: Session,
    intent: ActivateActionBarMessage,
    now: number,
  ): void {
    const action = session.actionBar[intent.slotIndex]?.action;
    if (!action || action.kind === "text") {
      session.pendingManualActionBarActivation = null;
      session.send({
        type: "action-bar-activation-result",
        slotIndex: intent.slotIndex,
        accepted: false,
      });
      return;
    }
    const cooldown = this.actionCooldown(session, action);
    if (
      cooldown.readyAt <= now &&
      this.actionTemporarilyBlockedByItems(session, action)
    ) {
      const player = playerForSession(this.world, session);
      if (!player) {
        session.sendError("join-required");
        return;
      }
      session.pendingManualActionBarActivation = {
        intent: { ...intent },
        action,
        attackTargetId: session.attackTargetId,
        direction: player.direction,
      };
      session.send({
        type: "action-bar-activation-result",
        slotIndex: intent.slotIndex,
        accepted: true,
      });
      return;
    }
    session.pendingManualActionBarActivation = null;
    const errorRevision = session.errorRevision;
    const started = this.activateAction(
      session,
      action,
      intent.target,
      now,
      false,
    );
    session.send({
      type: "action-bar-activation-result",
      slotIndex: intent.slotIndex,
      accepted:
        started && session.errorRevision === errorRevision,
    });
  }

  onMonsterSpawn(monster: Monster, now: number): void {
    this.monsterEventHooks?.onMonsterSpawn(monster, now);
  }

  onMonsterThink(monster: Monster, now: number): void {
    for (const effect of this.monsterEventHooks?.onMonsterThink(monster, now) ?? []) {
      if (this.world.getCreature(effect.target.id) !== effect.target) continue;
      this.damage.applyDamage(effect.target, effect.damage, now);
    }
  }

  /**
   * Immediate damage from a sprung trap tile. There is no creature source, so
   * it carries no PVP consequence and no experience credit — the amount is
   * rolled server-side by the shared combat formula.
   */
  applyTileTrapDamage(
    creature: Creature,
    damage: {
      readonly minimum: number;
      readonly maximum: number;
      readonly type: "earth" | "physical";
    },
    now: number,
  ): void {
    if (this.world.getCreature(creature.id) !== creature) return;
    this.damage.applyDamage(
      creature,
      {
        sourceId: null,
        // Sourceless environmental damage rides the same origin as field and
        // poison ticks, so no new protocol origin is needed for it.
        origin: "condition",
        type: damage.type,
        minimum: damage.minimum,
        maximum: damage.maximum,
      },
      now,
    );
  }

  tick(now: number): void {
    this.executeQueuedMonsterAbilities(now);
    this.executeQueuedTeleports(now);
    this.world.combatFields.tick(now);
    for (const creature of this.world.allCreatures()) {
      const tileDamage = this.monsterEventHooks?.onCreatureTile(creature, now);
      if (tileDamage) this.damage.applyDamage(creature, tileDamage, now);
      this.applyFieldAtCreature(creature, now);
    }
    this.conditionSystem.tick(now);
    this.moveFearedCreatures(now);
    for (const session of this.registry.all()) {
      this.tickHuntingBotTarget(session, now);
      this.activatePendingManualActionBar(session, now);
      this.actionBot.tick(session, now);
      this.autoAttack.tickPlayerAttack(session, now);
      this.tickFollow(session, now);
      this.tickCombatAnalyzer(session, now);
      this.tickGiftOfLifeCooldown(session, now);
      this.tickMomentum(session, now);
    }
  }

  /**
   * The hunting bot's auto-target. Runs only while the bot is armed, so a
   * player who picks a target by hand is never overruled by it.
   *
   * Re-evaluated on a cadence rather than every tick: the ranking is stable
   * while a fight is running (the engaged monster keeps losing health, so it
   * keeps winning), and re-publishing the same target every tick would flood
   * the connection with `attack-target-changed` and `fight-state` for nothing
   * (charter rule 10).
   */
  private tickHuntingBotTarget(session: Session, now: number): void {
    if (!session.huntingBotEnabled) return;
    if (now < (this.nextHuntingBotTargetAt.get(session) ?? 0)) return;
    this.nextHuntingBotTargetAt.set(
      session,
      now + HUNTING_BOT_TARGET_INTERVAL_MS,
    );
    // A queued action-bar activation is pinned to the target it was aimed at;
    // retargeting underneath it would silently eat the player's spell.
    if (session.pendingManualActionBarActivation) return;
    if (session.followTargetId) return;
    const player = playerForSession(this.world, session);
    if (!player || player.health <= 0) return;
    const best = selectAutoTarget({
      world: this.world,
      session,
      player,
      pvpHooks: this.pvpHooks,
      // Until the spawn runtime exists nothing can be proven to be a summon;
      // fail closed and leave targeting alone rather than attack a pet.
      isSummon: (monster) => this.targeting?.isSummon(monster) ?? true,
    });
    const nextId = best?.id ?? null;
    if (session.attackTargetId === nextId) return;
    if (!nextId && !session.attackTargetId) return;
    this.feedback.setTarget(session, nextId, now);
  }

  /**
   * Helmet-tier momentum (Feature 78, Canary player.cpp:10885-10927): rolls
   * on even seconds while in a fight outside protection zones; a proc takes
   * 2000 ms off every running per-spell cooldown.
   */
  private tickMomentum(session: Session, now: number): void {
    const player = playerForSession(this.world, session);
    if (!player) return;
    if (now < (this.nextMomentumRollAt.get(player) ?? 0)) return;
    this.nextMomentumRollAt.set(player, now + 1_000);
    if (Math.floor(now / 1_000) % 2 !== 0) return;
    if (!player.conditions.has("combat-lock")) return;
    if (this.world.isProtectionZone(player.position)) return;
    const chance = playerTierBonuses(
      this.items.combatEquipment(player.id),
    ).momentumChancePercent;
    if (chance <= 0 || !this.formula.chance(chance)) return;
    let reducedAny = false;
    for (const [group, cooldown] of session.combatCooldowns) {
      if (!group.startsWith("spell:") || cooldown.readyAt <= now) continue;
      session.combatCooldowns.set(group, {
        readyAt: Math.max(now, cooldown.readyAt - 2_000),
        totalMs: cooldown.totalMs,
      });
      reducedAny = true;
    }
    if (!reducedAny) return;
    session.send({
      type: "combat-log",
      kind: "condition",
      text: "Momentum was triggered.",
    });
    this.feedback.sendFightState(session, now);
  }

  /**
   * Canary ticks the Gift of Life cooldown down one second per on-think
   * while the character is online (player_wheel.cpp:3334-3336); it never
   * advances offline. Persisted as a character storage value.
   */
  private tickGiftOfLifeCooldown(session: Session, now: number): void {
    const player = playerForSession(this.world, session);
    if (!player) return;
    if (now < (this.nextGiftOfLifeTickAt.get(player) ?? 0)) return;
    this.nextGiftOfLifeTickAt.set(player, now + 1_000);
    const remaining = player.storageValue(GIFT_OF_LIFE_STORAGE_KEY);
    if (remaining <= 0) return;
    player.setStorageValue(GIFT_OF_LIFE_STORAGE_KEY, remaining - 1);
    this.persistence.markDirty(player);
  }

  /**
   * Pushes the analyzer on a fixed cadence rather than per damage event, so a
   * long fight cannot turn into a message flood (charter rule 10).
   */
  private tickCombatAnalyzer(session: Session, now: number): void {
    if (now < session.nextCombatAnalyzerAt) return;
    session.nextCombatAnalyzerAt = now + COMBAT_ANALYZER_INTERVAL_MS;
    const player = playerForSession(this.world, session);
    if (!player) return;
    if (
      player.analyzer.damageDealt === 0 &&
      player.analyzer.damageTaken === 0 &&
      player.analyzer.healingDone === 0 &&
      !player.partyMember
    ) {
      return;
    }
    this.sendCombatAnalyzer(session, now);
  }

  /**
   * Re-validates the follow target from live state every tick (charter rule
   * 4): a creature that logged out, died, changed floor, or left the view
   * range drops the follow instead of steering the player toward a position
   * the client was never told about.
   */
  private tickFollow(session: Session, now: number): void {
    const followTargetId = session.followTargetId;
    if (!followTargetId) return;
    const player = playerForSession(this.world, session);
    const target = this.world.getCreature(followTargetId);
    if (
      !player ||
      !target ||
      target.health <= 0 ||
      target.position.z !== player.position.z ||
      !session.knownCreatureIds.has(target.id) ||
      !this.world.canSee(player.position, target.position, session.viewRange)
    ) {
      this.feedback.setFollowTarget(session, null);
      return;
    }
    this.chase.followTarget(session, player, target, now);
  }

  private activatePendingManualActionBar(
    session: Session,
    now: number,
  ): void {
    const pending = session.pendingManualActionBarActivation;
    if (!pending) return;
    const action = session.actionBar[pending.intent.slotIndex]?.action;
    const player = playerForSession(this.world, session);
    if (
      !player ||
      !action ||
      action.kind === "text" ||
      action !== pending.action ||
      (this.actionUsesAttackTarget(action) &&
        session.attackTargetId !== pending.attackTargetId) ||
      (this.actionUsesDirection(action) &&
        player.direction !== pending.direction)
    ) {
      session.pendingManualActionBarActivation = null;
      return;
    }
    if (this.actionTemporarilyBlockedByItems(session, action)) return;
    session.pendingManualActionBarActivation = null;
    if (this.actionCooldown(session, action).readyAt > now) return;
    session.actionBotSuppressedAt = now;
    const errorRevision = session.errorRevision;
    const started = this.activateAction(
      session,
      action,
      pending.intent.target,
      now,
      false,
    );
    if (!started && session.errorRevision === errorRevision) {
      session.sendError("combat-action-failed");
    }
  }

  private actionTemporarilyBlockedByItems(
    session: Session,
    action: ActionBotAction,
  ): boolean {
    if (action.kind === "spell") {
      const spell = this.spells.get(action.spellId);
      return (
        session.itemOperationPending ||
        Boolean(spell?.conjure && session.itemPersistsPending > 0)
      );
    }
    const rune = this.spells.getRune(action.itemTypeId);
    if (rune) {
      return (
        session.itemOperationPending || session.itemPersistsPending > 0
      );
    }
    if (getPotionDefinition(action.itemTypeId)) {
      return session.itemOperationPending || session.potionPersistPending;
    }
    return false;
  }

  private actionUsesAttackTarget(
    action: Session["actionBar"][number]["action"],
  ): boolean {
    if (!action || action.kind === "text") return false;
    if (action.kind === "item") return action.mode === "use-on-target";
    const spell = this.spells.get(action.spellId);
    return Boolean(
      spell &&
        getSpellActionTargetMode(spell.targetKind, action.targetMode) ===
          "attack-target",
    );
  }

  private actionUsesDirection(
    action: Session["actionBar"][number]["action"],
  ): boolean {
    if (!action || action.kind !== "spell") return false;
    const spell = this.spells.get(action.spellId);
    return Boolean(
      spell &&
        getSpellActionTargetMode(spell.targetKind, action.targetMode) ===
          "direction",
    );
  }

  private activateAutomaticAction(
    session: Session,
    action: ActionBotAction,
    suppliedTarget: CombatTarget | undefined,
    now: number,
  ): { readonly started: boolean; readonly nextAttemptAt: number } {
    const cooldown = this.actionCooldown(session, action);
    if (cooldown.readyAt > now) {
      return { started: false, nextAttemptAt: cooldown.readyAt };
    }
    const started = this.activateAction(
      session,
      action,
      suppliedTarget,
      now,
      true,
    );
    const updatedCooldown = this.actionCooldown(session, action);
    return {
      started,
      nextAttemptAt: started
        ? Math.max(
            now + 500,
            now + cooldown.totalMs,
            updatedCooldown.readyAt,
          )
        : Math.max(now + 250, updatedCooldown.readyAt),
    };
  }

  private activateAction(
    session: Session,
    action: ActionBotAction,
    suppliedTarget: CombatTarget | undefined,
    now: number,
    automatic: boolean,
  ): boolean {
    const player = playerForSession(this.world, session);
    if (!player) return false;
    if (action.kind === "spell") {
      const spell = this.spells.get(action.spellId);
      if (!spell || spell.origin !== "spell") return false;
      const targetMode = getSpellActionTargetMode(
        spell.targetKind,
        action.targetMode,
      );
      const target = this.actionTarget(
        targetMode,
        suppliedTarget,
      ) ??
        (automatic
          ? this.automaticTarget(
              session,
              spell.targetKind === "position",
            )
          : null);
      if (
        !target ||
        (automatic &&
          !this.spellCaster.canBeginSpell(
            session,
            player,
            spell,
            target,
            now,
          ))
      ) {
        return false;
      }
      this.castSpell(
        session,
        {
          type: "cast-spell",
          spellId: spell.id,
          target,
          // Bound word parameter (exani hur up/down, summon creature): the
          // slot only names it, the cast pipeline resolves and validates it.
          ...(action.parameter !== undefined
            ? { parameter: action.parameter }
            : {}),
        },
        now,
      );
      return true;
    }
    if (action.mode === "equip") {
      return this.items.toggleEquippedItem(
        session,
        action.itemTypeId,
        automatic ? true : null,
        now,
      );
    }
    const combatItem = this.items.combatItemByType(
      player.id,
      action.itemTypeId,
    );
    if (!combatItem) return false;
    const targetMode =
      action.mode === "use-on-self"
        ? "self"
        : action.mode === "use-on-target"
          ? "attack-target"
          : action.mode === "use-at-cursor"
            ? "cursor"
            : action.mode === "use-with-crosshair"
              ? "crosshair"
              : null;
    const target = targetMode
      ? this.actionTarget(targetMode, suppliedTarget)
      : undefined;
    const potion = getPotionDefinition(action.itemTypeId);
    if (potion) {
      const potionTarget =
        target ?? (automatic ? this.automaticTarget(session, false) : null);
      const targetPlayerId = this.targetCreatureId(
        session,
        player,
        potionTarget ?? undefined,
      );
      if (!targetPlayerId) return false;
      return this.potions.use(
        session,
        {
          type: "use-potion",
          itemId: combatItem.item.id,
          revision: combatItem.item.version,
          targetPlayerId,
        },
        now,
        !automatic,
      );
    }
    const rune = this.spells.getRune(action.itemTypeId);
    if (rune) {
      const runeTarget =
        target ??
        (automatic
          ? this.automaticTarget(
              session,
              rune.targetKind === "position",
            )
          : null);
      if (
        !runeTarget ||
        (automatic &&
          !this.spellCaster.canBeginSpell(
            session,
            player,
            rune,
            runeTarget,
            now,
          ))
      ) {
        return false;
      }
      return this.useRune(
        session,
        {
          type: "use-rune",
          itemId: combatItem.item.id,
          revision: combatItem.item.version,
          target: runeTarget,
        },
        now,
      );
    }
    const itemTarget =
      target ?? (automatic ? this.automaticTarget(session, true) : null);
    const targetPosition = itemTarget
      ? this.targetPosition(session, player, itemTarget)
      : null;
    if (
      targetPosition &&
      action.mode !== "use" &&
      this.useItemWith?.(
        session,
        {
          type: "use-item-with",
          itemId: combatItem.item.id,
          revision: combatItem.item.version,
          targetPosition,
        },
        now,
      )
    ) {
      return true;
    }
    return this.items.activateOwnedItem(
      session,
      action.itemTypeId,
      action.mode,
      targetPosition,
      now,
    );
  }

  private activateAutomaticSpell(
    session: Session,
    spellId: string,
    now: number,
  ): { readonly started: boolean; readonly nextAttemptAt: number } {
    if (
      spellId !== "utani-hur" &&
      spellId !== "utani-gran-hur" &&
      spellId !== "utamo-vita"
    ) {
      return { started: false, nextAttemptAt: now + 250 };
    }
    const player = playerForSession(this.world, session);
    const spell = this.spells.get(spellId);
    const target = { kind: "self" } as const;
    if (!spell) {
      return { started: false, nextAttemptAt: now + 250 };
    }
    const cooldown = this.spellCooldown(session, spell);
    if (cooldown.readyAt > now) {
      return { started: false, nextAttemptAt: cooldown.readyAt };
    }
    if (
      !player ||
      spell.origin !== "spell" ||
      spell.targetKind !== "self" ||
      !this.spellCaster.canBeginSpell(
        session,
        player,
        spell,
        target,
        now,
      )
    ) {
      return { started: false, nextAttemptAt: now + 250 };
    }
    this.castSpell(
      session,
      { type: "cast-spell", spellId, target },
      now,
    );
    return {
      started: true,
      nextAttemptAt: Math.max(
        now + 500,
        now + cooldown.totalMs,
        this.spellCooldown(session, spell).readyAt,
      ),
    };
  }

  private actionCooldown(
    session: Session,
    action: ActionBotAction,
  ): { readonly readyAt: number; readonly totalMs: number } {
    if (action.kind === "spell") {
      const spell = this.spells.get(action.spellId);
      return spell
        ? this.spellCooldown(session, spell)
        : { readyAt: 0, totalMs: 0 };
    }
    if (getPotionDefinition(action.itemTypeId)) {
      return (
        session.combatCooldowns.get("potion") ?? {
          readyAt: 0,
          totalMs: 0,
        }
      );
    }
    const rune = this.spells.getRune(action.itemTypeId);
    return rune
      ? this.spellCooldown(session, rune)
      : { readyAt: 0, totalMs: 0 };
  }

  private spellCooldown(
    session: Session,
    spell: SpellDefinition,
  ): { readonly readyAt: number; readonly totalMs: number } {
    return {
      readyAt: Math.max(
        session.combatCooldowns.get(`spell:${spell.id}`)?.readyAt ?? 0,
        ...spell.groups.map(
          (group) =>
            session.combatCooldowns.get(`group:${group}`)?.readyAt ?? 0,
        ),
      ),
      totalMs: Math.max(spell.cooldownMs, ...spell.groupCooldownMs),
    };
  }

  private deactivateAction(
    session: Session,
    action: ActionBotAction,
    now: number,
  ): boolean {
    if (action.kind !== "item" || action.mode !== "equip") return false;
    return this.items.toggleEquippedItem(
      session,
      action.itemTypeId,
      false,
      now,
    );
  }

  private actionTarget(
    mode: "self" | "attack-target" | "direction" | "cursor" | "crosshair",
    supplied: CombatTarget | undefined,
  ): CombatTarget | null {
    if (mode === "self") return { kind: "self" };
    if (mode === "attack-target") return { kind: "attack-target" };
    if (mode === "direction") return { kind: "direction" };
    if (
      supplied?.kind === "position" ||
      supplied?.kind === "creature"
    ) {
      return supplied;
    }
    return null;
  }

  private automaticTarget(
    session: Session,
    asPosition: boolean,
  ): CombatTarget | null {
    if (!session.attackTargetId) return null;
    if (!asPosition) return { kind: "attack-target" };
    const target = this.world.getCreature(session.attackTargetId);
    return target
      ? { kind: "position", position: target.position }
      : null;
  }

  private targetCreatureId(
    session: Session,
    player: Player,
    target: CombatTarget | undefined,
  ): string | null {
    if (target?.kind === "self") return player.id;
    if (target?.kind === "creature") return target.creatureId;
    if (target?.kind === "attack-target") return session.attackTargetId;
    return null;
  }

  private targetPosition(
    session: Session,
    player: Player,
    target: CombatTarget,
  ): Position | null {
    if (target.kind === "self") return player.position;
    if (target.kind === "position") return target.position;
    const creatureId =
      target.kind === "attack-target"
        ? session.attackTargetId
        : target.kind === "creature"
          ? target.creatureId
          : null;
    return creatureId
      ? (this.world.getCreature(creatureId)?.position ?? null)
      : null;
  }

  /**
   * The position the ability's area is laid out around. Canary anchors an
   * area on the variant position, and for an untargeted (`needDirection`)
   * monster spell that position is `getCasterPosition(monster, direction)` —
   * the tile *ahead* of the monster, not the victim's tile. Anchoring on the
   * victim would drop a whole directional matrix on top of them regardless of
   * how far away they stand; anchoring on the monster would shift the wave a
   * tile short and put the monster inside its own area.
   */
  private abilityCenter(
    monster: Monster,
    resolvedTarget: Creature,
    ability: MonsterAbility,
  ): Position {
    if (ability.target === "self") return monster.position;
    if (ability.target !== "direction") return resolvedTarget.position;
    const [dx, dy] = directionDelta(
      directionToward(monster.position, resolvedTarget.position),
    );
    return {
      x: monster.position.x + dx,
      y: monster.position.y + dy,
      z: monster.position.z,
    };
  }

  executeMonsterAbility(
    monster: Monster,
    target: Creature | null,
    ability: MonsterAbility,
    now: number,
    targetAlreadyValidated = false,
    pathOrigin?: Position,
  ): boolean {
    if (
      monster.health <= 0 ||
      this.world.getCreature(monster.id) !== monster ||
      ability.kind === "stats"
    ) {
      return false;
    }
    const resolvedTarget = ability.target === "self" ? monster : (target ?? monster);
    if (
      !resolvedTarget ||
      resolvedTarget.health <= 0 ||
      this.world.getCreature(resolvedTarget.id) !== resolvedTarget
    ) {
      return false;
    }
    if (
      target &&
      target !== monster &&
      !targetAlreadyValidated &&
      ((ability.range > 0 &&
        !isInRange(monster.position, target.position, ability.range)) ||
        !this.world.hasLineOfSight(monster.position, target.position) ||
        (target instanceof Player &&
          (this.world.isProtectionZone(monster.position) ||
            this.world.isProtectionZone(target.position))))
    ) {
      return false;
    }
    if (ability.phases && ability.phases.length > 0) {
      for (const phase of ability.phases) {
        this.queuedMonsterAbilities.push({
          executeAt: now + phase.delayMs,
          monsterId: monster.id,
          targetId: resolvedTarget.id,
          ability: {
            ...ability,
            area: phase.area ?? ability.area,
            phases: undefined,
          },
        });
      }
      return true;
    }
    if (ability.chain) {
      const targets = this.chainTargets(monster, resolvedTarget, ability);
      if (targets.length === 0) return false;
      const chainedAbility: MonsterAbility = {
        ...ability,
        target: "target",
        chain: undefined,
        phases: undefined,
        pathEffect: ability.chain.effect ?? ability.pathEffect,
      };
      targets.forEach((chainTarget, index) => {
        const origin = index === 0
          ? monster.position
          : targets[index - 1]?.position;
        if (index === 0) {
          this.executeMonsterAbility(
            monster,
            chainTarget,
            chainedAbility,
            now,
            true,
            origin,
          );
          return;
        }
        this.queuedMonsterAbilities.push({
          executeAt: now + index * 50,
          monsterId: monster.id,
          targetId: chainTarget.id,
          ability: chainedAbility,
          targetAlreadyValidated: true,
          ...(origin ? { pathOrigin: { ...origin } } : {}),
        });
      });
      return true;
    }
    const center = this.abilityCenter(monster, resolvedTarget, ability);
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
    const effectId = ability.effect === undefined
      ? undefined
      : getMagicEffectId(ability.effect);
    if (ability.pathEffect && resolvedTarget !== monster) {
      this.broadcastPathEffect(
        pathOrigin ?? monster.position,
        resolvedTarget.position,
        getMagicEffectId(ability.pathEffect),
      );
    }
    const positions = areaPositions(monster.position, center, ability.area)
      .filter(
        (position) =>
          this.world.getTile(position) &&
          this.world.hasLineOfSight(monster.position, position),
      );
    const affected =
      ability.area.shape === "single"
        ? [resolvedTarget]
        : creaturesInArea(this.world, monster.position, center, ability.area);
    if (
      effectId !== undefined &&
      (ability.area.shape !== "single" || ability.kind === "effect")
    ) {
      for (const position of positions) {
        this.visibility.broadcastMagicEffect(position, effectId);
      }
    }
    if (ability.field) {
      for (const position of positions) {
        if (!this.world.isWalkable(position)) continue;
        this.world.combatFields.create(
          position,
          ability.field.type,
          monster.id,
          now,
        );
        this.visibility.broadcastMagicEffect(
          position,
          ability.field.type === "fire"
            ? 7
            : ability.field.type === "poison"
              ? 21
              : 38,
        );
      }
    }
    if (ability.destroyMagicWalls) {
      const removed = this.items.removeFirstWorldItemByTypeIds(
        monster.position,
        2,
        [2_128, 2_130, 10_181, 10_182],
        now,
      );
      if (removed) this.visibility.broadcastMagicEffect(monster.position, 3);
    }
    if (ability.dispel) {
      for (const creature of affected) {
        if (!this.canReceiveMonsterCondition(monster, creature, ability)) continue;
        this.conditionSystem.removeCondition(creature, ability.dispel, now);
      }
    }
    if (ability.conditions && ability.conditions.length > 0) {
      const immediate = ability.conditions.filter(
        (condition) => !condition.tickSchedule,
      );
      for (const creature of affected) {
        if (!this.canReceiveMonsterCondition(monster, creature, ability)) continue;
        this.applyMonsterAbilityConditions(
          monster,
          creature,
          ability,
          immediate,
          effectId,
          now,
        );
      }
    }
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
            ...(effectId !== undefined ? { effectId } : {}),
            ...(ability.conditionType === "outfit"
              ? { outfit: monster.outfit }
              : {}),
          },
          now,
        );
      }
      return true;
    }
    if (ability.questAction === "spider-queen-wrap") {
      if (!(resolvedTarget instanceof Player)) return false;
      this.conditionSystem.applyCondition(
        resolvedTarget,
        {
          type: "outfit",
          sourceId: monster.id,
          durationMs: 30_000,
          outfit: {
            lookType: 422,
            head: 0,
            body: 0,
            legs: 0,
            feet: 0,
            addons: 0,
          },
        },
        now,
      );
      resolvedTarget.setStorageValue(
        "Quest.U9_1.TheRookieGuard.Mission05",
        4,
      );
      this.persistence.markDirty(resolvedTarget);
      this.queuedTeleports.push({
        executeAt: now + 4_500,
        playerId: resolvedTarget.id,
        position: { x: 32_013, y: 32_087, z: 10 },
      });
    }
    if (ability.targetRule) {
      for (const creature of affected) {
        this.applyMonsterTargetRule(monster, creature, ability, effectId, now);
      }
      return true;
    }
    if (ability.kind === "effect") return true;
    // Influenced/fiendish monsters hit harder (Canary monster.cpp:3550-3556:
    // x1.35 + 0.1 per extra stack), applied at execution to damage only.
    const attackMultiplier =
      ability.kind === "healing" ? 1 : monster.forgeAttackMultiplier;
    const request: DamageRequest = {
      sourceId: monster.id,
      origin: "monster",
      type:
        ability.kind === "healing"
          ? "healing"
          : (ability.damageType ?? "physical"),
      minimum: Math.round((ability.minimum ?? 0) * attackMultiplier),
      maximum: Math.round(
        (ability.maximum ?? ability.minimum ?? 0) * attackMultiplier,
      ),
      ...(ability.area.shape === "single" && effectId !== undefined
        ? { effectId }
        : {}),
      ignoreArmor: ability.damageType !== "physical",
      ignoreShield: ability.damageType !== "physical",
      ...(ability.kind !== "healing" &&
        (monster.type.flags.criticalChance ?? 0) > 0
        ? {
            criticalChance: monster.type.flags.criticalChance,
            // Canary monster criticals default to a visual-only 0% bonus.
            criticalDamagePercent: 0,
          }
        : {}),
    };
    for (const creature of affected) {
      if (ability.kind === "healing") {
        // Self-heals bypass canMonsterAffect, which always excludes self.
        if (creature !== monster) continue;
      } else if (
        creature === monster ||
        creature.kind === "npc" ||
        !canMonsterAffect(this.world, monster, creature)
      ) {
        continue;
      }
      const result = this.damage.applyDamage(creature, request, now);
      if (result.healthChanged || result.manaChanged) {
        if (result.critical) {
          this.visibility.broadcastMagicEffect(
            creature.position,
            CRITICAL_DAMAGE_EFFECT_ID,
            creature.id,
          );
        }
        this.applyMonsterAbilityConditions(
          monster,
          creature,
          ability,
          ability.conditions?.filter((condition) => condition.tickSchedule) ?? [],
          effectId,
          now,
        );
      }
    }
    return true;
  }

  private applyMonsterAbilityConditions(
    monster: Monster,
    creature: Creature,
    ability: MonsterAbility,
    conditions: NonNullable<MonsterAbility["conditions"]>,
    effectId: number | undefined,
    now: number,
  ): void {
    for (const condition of conditions) {
      const attributes = condition.attributes
        ? Object.fromEntries(
            Object.entries(condition.attributes).map(([key, value]) => [
              key,
              this.formula.integer(value.minimum, value.maximum),
            ]),
          )
        : undefined;
      const speedPercent = this.formula.integer(
        condition.speedPercentMinimum ?? 0,
        condition.speedPercentMaximum ?? condition.speedPercentMinimum ?? 0,
      );
      const baseSpeed = Math.max(
        10,
        creature.stepSpeed - creature.conditions.speedModifier,
      );
      const tickDamage = condition.tickDamage;
      const tickBase = tickDamage
        ? this.formula.integer(tickDamage.minimum, tickDamage.maximum)
        : undefined;
      const schedule = condition.tickSchedule;
      const tickAmounts = schedule
        ? [...schedule.amounts]
        : tickDamage && tickBase !== undefined
          ? Array.from({ length: tickDamage.count }, (_, index) =>
              Math.max(1, Math.round(tickBase * tickDamage.multiplier ** index)),
            )
          : undefined;
      this.conditionSystem.applyCondition(
        creature,
        {
          type: condition.type,
          sourceId: monster.id,
          durationMs: condition.durationMs,
          ...(speedPercent > 0
            ? { magnitude: Math.floor(baseSpeed * speedPercent / 100) }
            : {}),
          ...(attributes ? { attributes } : {}),
          ...(tickAmounts && schedule
            ? {
                tickAmounts,
                tickIntervalMs: schedule.intervalMs,
                damageType: schedule.damageType,
              }
            : tickAmounts && tickDamage
              ? {
                  tickAmounts,
                  tickIntervalMs: tickDamage.intervalMs,
                  damageType: tickDamage.damageType,
                }
              : {}),
          ...(condition.type === "fear"
            ? { fearSource: { ...monster.position } }
            : {}),
          ...(ability.area.shape === "single" && effectId !== undefined
            ? { effectId }
            : {}),
        },
        now,
      );
    }
  }

  private executeQueuedMonsterAbilities(now: number): void {
    const due = [...drainDue(this.queuedMonsterAbilities, now)].sort(
      (left, right) => left.executeAt - right.executeAt,
    );
    for (const entry of due) {
      const monster = this.world.getCreature(entry.monsterId);
      const target = this.world.getCreature(entry.targetId);
      if (!(monster instanceof Monster) || !target) continue;
      this.executeMonsterAbility(
        monster,
        target,
        entry.ability,
        now,
        entry.targetAlreadyValidated,
        entry.pathOrigin,
      );
    }
  }

  private executeQueuedTeleports(now: number): void {
    for (const entry of drainDue(this.queuedTeleports, now)) {
      const player = this.world.getPlayer(entry.playerId);
      if (
        !player ||
        !this.world.isWalkable(entry.position) ||
        this.world.isOccupied(entry.position)
      ) {
        continue;
      }
      const from = this.world.relocateCreature(player, entry.position);
      this.persistence.markDirty(player);
      const session = this.registry.sessionFor(player.id);
      if (session) this.visibility.onPlayerTeleported(session, player, from);
      this.visibility.broadcastMagicEffect(from, 11, player.id);
      this.visibility.broadcastMagicEffect(player.position, 11, player.id);
    }
  }

  private chainTargets(
    monster: Monster,
    initialTarget: Creature,
    ability: MonsterAbility,
  ): Creature[] {
    const chain = ability.chain;
    if (!chain) return [];
    if (
      initialTarget !== monster &&
      !canMonsterAffect(this.world, monster, initialTarget)
    ) {
      return [];
    }
    const targets = initialTarget === monster ? [] : [initialTarget];
    const visited = new Set([monster.id]);
    if (initialTarget !== monster) visited.add(initialTarget.id);
    let current = initialTarget;
    while (targets.length < chain.additionalTargets + 1) {
      const candidate = this.world
        .creaturesNear(current.position, { x: chain.range, y: chain.range })
        .filter(
          (creature) =>
            !visited.has(creature.id) &&
            creature.health > 0 &&
            (!chain.playersOnly || creature instanceof Player) &&
            canMonsterAffect(this.world, monster, creature) &&
            (!(creature instanceof Player) ||
              (!this.world.isProtectionZone(monster.position) &&
                !this.world.isProtectionZone(creature.position))) &&
            this.world.hasLineOfSight(current.position, creature.position),
        )
        .sort(
          (left, right) =>
            this.distance(current.position, left.position) -
              this.distance(current.position, right.position) ||
            left.id.localeCompare(right.id),
        )[0];
      if (!candidate) break;
      targets.push(candidate);
      visited.add(candidate.id);
      current = candidate;
    }
    return targets;
  }

  private applyMonsterTargetRule(
    monster: Monster,
    creature: Creature,
    ability: MonsterAbility,
    effectId: number | undefined,
    now: number,
  ): void {
    const rule = ability.targetRule;
    if (!rule || creature.kind === "npc") return;
    let type = rule.damageType;
    if (rule.kind === "players-damage-monsters-heal") {
      if (creature instanceof Monster) type = "healing";
      else if (!canMonsterAffect(this.world, monster, creature)) return;
    } else if (rule.kind === "monsters-only-heal") {
      if (!(creature instanceof Monster)) return;
    } else {
      if (!(creature instanceof Monster)) return;
      const name = creature.name.toLowerCase();
      if (!rule.names.includes(name)) return;
      if (rule.excludeSameName && name === monster.name.toLowerCase()) return;
      if (!rule.includeCaster && creature === monster) return;
    }
    this.damage.applyDamage(
      creature,
      {
        sourceId: monster.id,
        origin: "monster",
        type,
        minimum: rule.minimum,
        maximum: rule.maximum,
        ...(ability.area.shape === "single" && effectId !== undefined
          ? { effectId }
          : {}),
        ignoreArmor: type !== "physical",
        ignoreShield: type !== "physical",
      },
      now,
    );
  }

  private canReceiveMonsterCondition(
    monster: Monster,
    creature: Creature,
    ability: MonsterAbility,
  ): boolean {
    if (ability.targetRule?.kind === "monsters-only-heal") {
      return creature instanceof Monster;
    }
    if (creature === monster) return ability.target === "self";
    return canMonsterAffect(this.world, monster, creature);
  }

  private broadcastPathEffect(from: Position, to: Position, effectId: number): void {
    let x = from.x;
    let y = from.y;
    for (let step = 0; step < 32 && (x !== to.x || y !== to.y); step++) {
      x += Math.sign(to.x - x);
      y += Math.sign(to.y - y);
      this.visibility.broadcastMagicEffect({ x, y, z: from.z }, effectId);
    }
  }

  private applyFieldAtCreature(creature: Creature, now: number): void {
    const fieldRevision = this.world.fieldRevision;
    const previous = this.lastFieldCheckByCreature.get(creature);
    if (
      previous?.positionRevision === creature.positionRevision &&
      previous.fieldRevision === fieldRevision
    ) {
      return;
    }
    this.lastFieldCheckByCreature.set(creature, {
      positionRevision: creature.positionRevision,
      fieldRevision,
    });
    const field = this.world.fieldTypeAt(creature.position, now);
    if (!field) {
      this.lastFieldByCreature.delete(creature);
      return;
    }
    const key = `${positionKey(creature.position)}:${field}`;
    if (this.lastFieldByCreature.get(creature) === key) return;
    this.lastFieldByCreature.set(creature, key);
    const dynamicField = this.world.combatFields.get(creature.position, now);
    const tickAmounts = field === "fire"
      ? Array.from({ length: 7 }, () => 20)
      : field === "energy"
        ? [25]
        : this.poisonFieldDamage();
    const intervalMs = field === "poison" ? 5_000 : 10_000;
    this.conditionSystem.applyCondition(
      creature,
      {
        type: field,
        sourceId: dynamicField?.sourceId ?? null,
        durationMs: tickAmounts.length * intervalMs,
        tickAmounts,
        tickIntervalMs: intervalMs,
        damageType: field === "poison" ? "earth" : field,
      },
      now,
    );
  }

  private poisonFieldDamage(): number[] {
    const damage: number[] = [];
    let sum = 0;
    for (let value = 5; value > 0; value--) {
      const sequenceIndex = 6 - value;
      const median = sequenceIndex * 100 / 5;
      do {
        sum += value;
        damage.push(value);
      } while (
        Math.abs(1 - (sum + value) / median) <
        Math.abs(1 - sum / median)
      );
    }
    return damage;
  }

  private moveFearedCreatures(now: number): void {
    for (const creature of this.world.allCreatures()) {
      if (!creature.conditions.isActive) continue;
      const source = creature.conditions.fearSource;
      if (!source || now < creature.nextStepAt || creature.health <= 0) continue;
      for (const direction of this.fearDirections(creature.position, source)) {
        const movement = this.world.tryMoveFearedCreature(creature, direction, now);
        if (!movement.moved) continue;
        if (creature instanceof Player) {
          this.persistence.markDirty(creature);
          const session = this.registry.sessionFor(creature.id);
          if (session && movement.from) {
            this.visibility.onPlayerStepped(
              session,
              creature,
              movement.from,
              movement.durationMs ?? 0,
            );
          }
        } else if (movement.from) {
          this.visibility.onCreatureStepped(
            creature,
            movement.from,
            movement.durationMs ?? 0,
          );
        }
        break;
      }
    }
  }

  private fearDirections(position: Position, source: Position): Direction[] {
    const awayX = position.x - source.x;
    const awayY = position.y - source.y;
    return [...FEAR_DIRECTIONS]
      .sort(
        (left, right) =>
          right[1] * awayX + right[2] * awayY -
            (left[1] * awayX + left[2] * awayY) ||
          left[0].localeCompare(right[0]),
      )
      .map(([direction]) => direction);
  }

  private distance(left: Position, right: Position): number {
    if (left.z !== right.z) return Number.POSITIVE_INFINITY;
    return Math.hypot(left.x - right.x, left.y - right.y);
  }
}
