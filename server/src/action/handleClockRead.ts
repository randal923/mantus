import type { WorldActionContext } from "./WorldActionContext";
import { worldTimeOfDay } from "./worldTimeOfDay";

/**
 * Canary's watch action: reports the world time. Purely a read — no state
 * changes, and the time is derived server-side from the world clock.
 */
export function handleClockRead(context: WorldActionContext): void {
  context.session.send({
    type: "combat-log",
    kind: "condition",
    text: `The time is ${worldTimeOfDay(context.wallClockMs)}.`,
  });
}
