import type { MailActionFailedReason } from "@tibia/protocol";

export interface MailboxSessionState {
  sessionId: string;
  pending: boolean;
  error: MailActionFailedReason | null;
  sentRecipient: string | null;
}
