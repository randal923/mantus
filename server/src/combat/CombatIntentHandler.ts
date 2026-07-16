import type {
  AttackTargetMessage,
  CancelAttackMessage,
  CastSpellMessage,
  SetFightModeMessage,
  UseRuneMessage,
} from "@tibia/protocol";
import type { Session } from "../Session";
import type { Combat } from "./Combat";

type CombatIntent =
  | AttackTargetMessage
  | CancelAttackMessage
  | SetFightModeMessage
  | CastSpellMessage
  | UseRuneMessage;

export class CombatIntentHandler {
  constructor(private readonly combat: Combat) {}

  handle(session: Session, intent: CombatIntent, now: number): void {
    if (intent.type === "attack-target") {
      this.combat.selectTarget(session, intent.creatureId, now);
      return;
    }
    if (intent.type === "cancel-attack") {
      this.combat.cancelTarget(session, now);
      return;
    }
    if (intent.type === "set-fight-mode") {
      this.combat.setFightMode(session, intent, now);
      return;
    }
    if (intent.type === "cast-spell") {
      this.combat.castSpell(session, intent, now);
      return;
    }
    this.combat.useRune(session, intent, now);
  }
}
