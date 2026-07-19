import { z } from "zod";
import { PROTOCOL_LIMITS } from "./limits";

export const REPORT_LIMITS = {
  maxCommentLength: 500,
  /** At most one report per minute per session (server-enforced). */
  minIntervalMs: 60_000,
  /** At most 20 reports per rolling day per character (server-enforced). */
  maxPerDay: 20,
} as const;

export const REPORT_REASONS = [
  "name",
  "cheating",
  "botting",
  "abuse",
  "other",
] as const;

export const reportReasonSchema = z.enum(REPORT_REASONS);

/**
 * Files one player report. The reporter is always the session's own
 * character; the target is resolved by name server-side at execution
 * time. Reports are write-only for players: no protocol message ever
 * returns stored reports (charter rule 6).
 */
export const reportPlayerMessageSchema = z
  .object({
    type: z.literal("report-player"),
    targetName: z
      .string()
      .min(PROTOCOL_LIMITS.minCharacterNameLength)
      .max(PROTOCOL_LIMITS.maxCharacterNameLength),
    reason: reportReasonSchema,
    comment: z.string().max(REPORT_LIMITS.maxCommentLength),
  })
  .strict();

/** Bare acknowledgement; deliberately carries no data about the target. */
export const reportReceivedMessageSchema = z
  .object({ type: z.literal("report-received") })
  .strict();

export const reportActionFailedMessageSchema = z
  .object({
    type: z.literal("report-action-failed"),
    reason: z.enum(["rate-limited", "target-not-found", "invalid-request"]),
  })
  .strict();

export type ReportReason = z.infer<typeof reportReasonSchema>;
export type ReportPlayerMessage = z.infer<typeof reportPlayerMessageSchema>;
export type ReportReceivedMessage = z.infer<typeof reportReceivedMessageSchema>;
export type ReportActionFailedMessage = z.infer<
  typeof reportActionFailedMessageSchema
>;
export type ReportActionFailedReason = ReportActionFailedMessage["reason"];
