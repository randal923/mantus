import type { ReportActionFailedReason } from "@tibia/protocol";

export interface ReportSessionState {
  targetName: string;
  pending: boolean;
  error: ReportActionFailedReason | null;
  sent: boolean;
}
