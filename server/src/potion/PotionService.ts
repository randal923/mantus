import type {
  ServerErrorCode,
  UsePotionMessage,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { CombatFormula } from "../combat/CombatFormula";
import { isInRange } from "../combat/isInRange";
import { playerForSession } from "../combat/playerForSession";
import { projectFightState } from "../combat/projectFightState";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { PartyHooks } from "../party/PartyHooks";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import { getVocation } from "../progression/getVocation";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { getPotionDefinition } from "./getPotionDefinition";

const POTION_COOLDOWN_GROUP = "potion";
const POTION_EXHAUST_MS = 1_000;
const POTION_EFFECT_ID = 13;

export class PotionService {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly progression: ProgressionSystem,
    private readonly items: ItemIntentHandler,
    private readonly formula: CombatFormula,
    private readonly registry: SessionRegistry,
    private readonly partyHooks?: PartyHooks,
  ) {}

  use(
    session: Session,
    intent: UsePotionMessage,
    now: number,
    reportRejection = true,
  ): boolean {
    const actor = playerForSession(this.world, session);
    const target = this.world.getPlayer(intent.targetPlayerId);
    const combatItem = actor
      ? this.items.combatItem(actor.id, intent.itemId, intent.revision)
      : null;
    const potion = combatItem
      ? getPotionDefinition(combatItem.item.typeId)
      : undefined;
    if (!actor || !target || !combatItem || !potion) {
      this.reject(session, "combat-action-failed", now, reportRejection);
      return false;
    }
    if (
      target.health <= 0 ||
      (target.id !== actor.id && !session.knownCreatureIds.has(target.id)) ||
      !this.world.canSee(actor.position, target.position, session.viewRange) ||
      !isInRange(actor.position, target.position, 1)
    ) {
      this.reject(session, "combat-action-failed", now, reportRejection);
      return false;
    }
    if (potion.level && actor.level < potion.level) {
      this.reject(session, "potion-level-restricted", now, reportRejection);
      return false;
    }
    const baseVocation = getVocation(
      actor.vocation,
      actor.progression.definitionVersion,
    ).baseVocation;
    if (potion.vocations && !potion.vocations.includes(baseVocation)) {
      this.reject(
        session,
        "potion-vocation-restricted",
        now,
        reportRejection,
      );
      return false;
    }
    const cooldown = session.combatCooldowns.get(POTION_COOLDOWN_GROUP);
    if (cooldown && cooldown.readyAt > now) {
      this.reject(session, "potion-exhausted", now, reportRejection);
      return false;
    }
    if (
      session.itemOperationPending ||
      session.potionPersistPending ||
      this.persistence.isExternalMutationPending(target)
    ) {
      this.reject(session, "combat-action-failed", now, reportRejection);
      return false;
    }

    const expectedHealth = target.health;
    const expectedMana = target.mana;
    const expectedTargetVersion = this.persistence.beginExternalMutation(
      target,
      now,
    );
    const healthRestore = potion.health
      ? this.formula.normalInteger(potion.health[0], potion.health[1])
      : 0;
    const manaRestore = potion.mana
      ? this.formula.normalInteger(potion.mana[0], potion.mana[1])
      : 0;
    const expectedHealthRestored =
      Math.min(target.maxHealth, expectedHealth + healthRestore) -
      expectedHealth;
    const expectedManaRestored =
      Math.min(target.maxMana, expectedMana + manaRestore) - expectedMana;
    const started = this.items.usePotionForCombat(
      session,
      {
        targetCharacterId: target.id,
        itemId: intent.itemId,
        expectedItemVersion: intent.revision,
        expectedTargetHealth: expectedHealth,
        expectedTargetMana: expectedMana,
        targetMaxHealth: target.maxHealth,
        targetMaxMana: target.maxMana,
        healthRestore,
        manaRestore,
      },
      expectedTargetVersion,
      (expectedVersion, result) => {
        if (
          result.healthRestored !== expectedHealthRestored ||
          result.manaRestored !== expectedManaRestored
        ) {
          const cause = new Error(
            "committed potion restore diverged from its in-memory result",
          );
          console.error(
            `potion result diverged for target ${target.id}; disconnecting to resync from DB`,
          );
          this.persistence.failExternalMutation(target, cause);
          this.registry.sessionFor(target.id)?.terminate();
          return;
        }
        this.persistence.completeExternalMutation(
          target,
          expectedVersion,
          result.targetCharacterVersion,
        );
      },
      (cause) => {
        this.persistence.failExternalMutation(target, cause);
        this.registry.sessionFor(target.id)?.terminate();
      },
      now,
    );
    if (!started) {
      this.persistence.cancelExternalMutation(target);
      return false;
    }
    const healthBefore = target.health;
    target.setHealth(target.health + healthRestore);
    target.restoreMana(manaRestore);
    const healthRestored = target.health - healthBefore;
    this.progression.notifyCommittedPlayer(target, now);
    if (healthRestored > 0) {
      this.visibility.broadcastHealth(target);
      this.visibility.broadcastCombatText(
        target,
        healthRestored,
        "healing",
        "none",
      );
      this.partyHooks?.recordPartnerHeal(actor.id, target.id, now);
    }
    this.visibility.broadcastMagicEffect(
      target.position,
      POTION_EFFECT_ID,
      target.id,
    );
    session.combatCooldowns.set(POTION_COOLDOWN_GROUP, {
      readyAt: now + POTION_EXHAUST_MS,
      totalMs: POTION_EXHAUST_MS,
    });
    session.send({
      type: "combat-log",
      kind: "healing",
      text: `Used ${combatItem.type.name} on ${target.name}.`,
    });
    this.sendFightState(session, now);
    return true;
  }

  private reject(
    session: Session,
    code: ServerErrorCode,
    now: number,
    report: boolean,
  ): void {
    if (!report) return;
    session.sendError(code);
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
}
