import type {
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
import { Player } from "../Player";
import type { PvpHooks } from "../pvp/PvpHooks";
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
import type { SpellDefinition } from "./Spell";
import { SpellCaster } from "./SpellCaster";
import { SpellRegistry } from "./SpellRegistry";
import { ActionBot } from "./ActionBot";
import { getPotionDefinition } from "../potion/getPotionDefinition";
import { getSpellActionTargetMode } from "./getSpellActionTargetMode";
import { drainDue } from "../drainDue";

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
  private readonly formula: CombatFormula;
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
    partyHooks?: PartyHooks,
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
      pvpHooks,
      partyHooks,
    );
    const chase = new ChaseController(world, visibility, persistence);
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
      (session, slotIndex, target, now) =>
        this.activateAutomaticActionBarSlot(
          session,
          slotIndex,
          target,
          now,
        ),
      (session, slotIndex, now) =>
        this.deactivateActionBarSlot(session, slotIndex, now),
      (session, spellId, now) =>
        this.activateAutomaticSpell(session, spellId, now),
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
      !canPlayerTarget(this.world, session, player, target, this.pvpHooks)
    ) {
      this.feedback.reject(session, now);
      return;
    }
    session.pendingManualActionBarActivation = null;
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

  castSpell(
    session: Session,
    intent: CastSpellMessage,
    now: number,
  ): void {
    const spell = this.spells.get(intent.spellId);
    if (!spell || spell.origin !== "spell") {
      this.feedback.reject(session, now, "spell-unavailable");
      return;
    }
    if (spell.conjure) {
      this.spellCaster.executeConjure(session, spell, intent.target, now);
      return;
    }
    this.spellCaster.executeSpell(session, spell, intent.target, now, true);
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
    const cooldown = this.actionBarCooldown(session, intent.slotIndex);
    if (
      action &&
      action.kind !== "text" &&
      cooldown.readyAt <= now &&
      this.actionBarTemporarilyBlockedByItems(session, action)
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
    const started = this.activateActionBarSlot(
      session,
      intent.slotIndex,
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
      this.activatePendingManualActionBar(session, now);
      this.actionBot.tick(session, now);
      this.autoAttack.tickPlayerAttack(session, now);
    }
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
    if (this.actionBarTemporarilyBlockedByItems(session, action)) return;
    session.pendingManualActionBarActivation = null;
    if (
      this.actionBarCooldown(session, pending.intent.slotIndex).readyAt > now
    ) {
      return;
    }
    session.actionBotSuppressedAt = now;
    const errorRevision = session.errorRevision;
    const started = this.activateActionBarSlot(
      session,
      pending.intent.slotIndex,
      pending.intent.target,
      now,
      false,
    );
    if (!started && session.errorRevision === errorRevision) {
      session.sendError("combat-action-failed");
    }
  }

  private actionBarTemporarilyBlockedByItems(
    session: Session,
    action: Exclude<
      NonNullable<Session["actionBar"][number]["action"]>,
      { readonly kind: "text" }
    >,
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

  private activateAutomaticActionBarSlot(
    session: Session,
    slotIndex: number,
    suppliedTarget: CombatTarget | undefined,
    now: number,
  ): { readonly started: boolean; readonly nextAttemptAt: number } {
    const cooldown = this.actionBarCooldown(session, slotIndex);
    if (cooldown.readyAt > now) {
      return { started: false, nextAttemptAt: cooldown.readyAt };
    }
    const started = this.activateActionBarSlot(
      session,
      slotIndex,
      suppliedTarget,
      now,
      true,
    );
    const updatedCooldown = this.actionBarCooldown(session, slotIndex);
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

  private activateActionBarSlot(
    session: Session,
    slotIndex: number,
    suppliedTarget: CombatTarget | undefined,
    now: number,
    automatic: boolean,
  ): boolean {
    const player = playerForSession(this.world, session);
    const action = session.actionBar[slotIndex]?.action;
    if (!player || !action || action.kind === "text") return false;
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
        { type: "cast-spell", spellId: spell.id, target },
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

  private actionBarCooldown(
    session: Session,
    slotIndex: number,
  ): { readonly readyAt: number; readonly totalMs: number } {
    const action = session.actionBar[slotIndex]?.action;
    if (!action || action.kind === "text") {
      return { readyAt: 0, totalMs: 0 };
    }
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

  private deactivateActionBarSlot(
    session: Session,
    slotIndex: number,
    now: number,
  ): boolean {
    const action = session.actionBar[slotIndex]?.action;
    if (action?.kind !== "item" || action.mode !== "equip") return false;
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
    const request: DamageRequest = {
      sourceId: monster.id,
      origin: "monster",
      type:
        ability.kind === "healing"
          ? "healing"
          : (ability.damageType ?? "physical"),
      minimum: ability.minimum ?? 0,
      maximum: ability.maximum ?? ability.minimum ?? 0,
      ...(ability.area.shape === "single" && effectId !== undefined
        ? { effectId }
        : {}),
      ignoreArmor: ability.damageType !== "physical",
      ignoreShield: ability.damageType !== "physical",
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
