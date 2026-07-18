import type { MailActionFailedReason } from "@tibia/protocol";
import type { Session } from "../Session";

export function failMail(
  session: Session,
  reason: MailActionFailedReason,
): void {
  session.send({ type: "mail-action-failed", reason });
}
