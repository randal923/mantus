import type { DepotActionFailedReason } from "@tibia/protocol";
import type { Session } from "../Session";

export function failDepot(
  session: Session,
  reason: DepotActionFailedReason,
): void {
  session.send({ type: "depot-action-failed", reason });
}
