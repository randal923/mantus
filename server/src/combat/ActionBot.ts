import type {
  ActionBotAction,
  ActionBotMonstersAround,
  ActionBotRule,
  CombatTarget,
} from "@tibia/protocol";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";

type ActivateAction = (
  session: Session,
  action: ActionBotAction,
  target: CombatTarget | undefined,
  now: number,
) => {
  readonly started: boolean;
  readonly nextAttemptAt: number;
};

type DeactivateAction = (
  session: Session,
  action: ActionBotAction,
  now: number,
) => boolean;

type ActivateSpell = (
  session: Session,
  spellId: string,
  now: number,
) => {
  readonly started: boolean;
  readonly nextAttemptAt: number;
};

/** Live count of the monsters the action's own area covers right now. */
type CountAreaMonsters = (
  session: Session,
  action: ActionBotAction,
) => number;

export class ActionBot {
  constructor(
    private readonly world: World,
    private readonly activate: ActivateAction,
    private readonly deactivate: DeactivateAction,
    private readonly activateSpell: ActivateSpell,
    private readonly countAreaMonsters: CountAreaMonsters,
  ) {}

  tick(session: Session, now: number): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    const settings = session.actionBotSettings;
    if (
      !player ||
      player.health <= 0 ||
      !settings.enabled ||
      session.actionBotUpdatePending ||
      session.actionBotSuppressedAt === now
    ) {
      return;
    }
    if (
      settings.autoUtamoVita &&
      !player.conditions.has("magic-shield") &&
      (session.actionBotRuleReadyAt.get("auto-utamo-vita") ?? 0) <= now
    ) {
      const result = this.activateSpell(session, "utamo-vita", now);
      session.actionBotRuleReadyAt.set(
        "auto-utamo-vita",
        result.nextAttemptAt,
      );
      if (result.started) return;
    }
    if (
      settings.autoHaste.enabled &&
      !player.conditions.has("haste") &&
      (session.actionBotRuleReadyAt.get("auto-haste") ?? 0) <= now
    ) {
      const result = this.activateSpell(
        session,
        settings.autoHaste.spellId,
        now,
      );
      session.actionBotRuleReadyAt.set(
        "auto-haste",
        result.nextAttemptAt,
      );
      if (result.started) return;
    }
    for (const rule of settings.rules) {
      if (!rule.enabled) continue;
      if ((session.actionBotRuleReadyAt.get(rule.id) ?? 0) > now) continue;
      const active =
        this.triggerActive(rule, player, session) &&
        this.monsterCountActive(rule, session);
      if (!active) {
        if (
          rule.unequipWhenInactive &&
          this.deactivate(session, rule.action, now)
        ) {
          session.actionBotRuleReadyAt.set(rule.id, now + 500);
          return;
        }
        continue;
      }
      const result = this.activate(
        session,
        rule.action,
        undefined,
        now,
      );
      session.actionBotRuleReadyAt.set(rule.id, result.nextAttemptAt);
      if (result.started) return;
    }
  }

  /**
   * Area rules wait for a crowd: the monsters the action would actually cover
   * are counted from the live world every tick, never from anything the rule
   * carries, so the gate cannot be stale when the cast happens.
   */
  private monsterCountActive(
    rule: ActionBotRule,
    session: Session,
  ): boolean {
    const requirement: ActionBotMonstersAround | undefined =
      rule.monstersAround;
    if (!requirement) return true;
    const monsters = this.countAreaMonsters(session, rule.action);
    if (requirement.comparison === "at-most") {
      return monsters <= requirement.count;
    }
    if (requirement.comparison === "exactly") {
      return monsters === requirement.count;
    }
    return monsters >= requirement.count;
  }

  private triggerActive(
    rule: ActionBotRule,
    player: Player,
    session: Session,
  ): boolean {
    const trigger = rule.trigger;
    if (trigger.kind === "condition-missing") {
      return !player.conditions.has(trigger.condition);
    }
    if (trigger.kind === "target-present") {
      const target = session.attackTargetId
        ? this.world.getCreature(session.attackTargetId)
        : undefined;
      return Boolean(
        target &&
          target.health > 0 &&
          session.knownCreatureIds.has(target.id) &&
          this.world.canSee(
            player.position,
            target.position,
            session.viewRange,
          ),
      );
    }
    const current =
      trigger.resource === "health" ? player.health : player.mana;
    const maximum =
      trigger.resource === "health" ? player.maxHealth : player.maxMana;
    return trigger.kind === "resource-below"
      ? current * 100 < maximum * trigger.percent
      : current * 100 > maximum * trigger.percent;
  }
}
