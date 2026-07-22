import type { ServerErrorCode } from "@tibia/protocol";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { projectFightState } from "./projectFightState";

export class CombatFeedback {
  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
  ) {}

  setTarget(
    session: Session,
    creatureId: string | null,
    now: number,
  ): void {
    session.attackTargetId = creatureId;
    session.send({ type: "attack-target-changed", creatureId });
    this.sendFightState(session, now);
  }

  reject(
    session: Session,
    now: number,
    code: ServerErrorCode = "combat-action-failed",
  ): void {
    session.sendError(code);
    this.sendFightState(session, now);
  }

  sendFightState(session: Session, now: number): void {
    for (const [group, cooldown] of session.combatCooldowns) {
      if (cooldown.readyAt <= now) session.combatCooldowns.delete(group);
    }
    session.send({
      type: "fight-state",
      fightState: projectFightState(session, this.world, now),
    });
  }

  sendFightStateForPlayer(playerId: string, now: number): void {
    const session = this.registry.sessionFor(playerId);
    if (session) this.sendFightState(session, now);
  }

  setCooldown(
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
}
