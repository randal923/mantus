"use client";

import { useState } from "react";
import {
  PROTOCOL_LIMITS,
  REPORT_LIMITS,
  REPORT_REASONS,
  type ReportReason,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface ReportPlayerModalProps {
  initialTargetName: string;
  pending: boolean;
  error: string | null;
  sent: boolean;
  onSubmit: (targetName: string, reason: ReportReason, comment: string) => void;
  onClose: () => void;
}

/**
 * Files a player report; the server validates the target and enforces
 * the report rate limits. Reports are write-only for players.
 */
export function ReportPlayerModal({
  initialTargetName,
  pending,
  error,
  sent,
  onSubmit,
  onClose,
}: ReportPlayerModalProps) {
  const { t } = useAppTranslation();
  const [targetName, setTargetName] = useState(initialTargetName);
  const [reason, setReason] = useState<ReportReason>("abuse");
  const [comment, setComment] = useState("");
  const canSubmit =
    !pending &&
    !sent &&
    targetName.trim().length >= PROTOCOL_LIMITS.minCharacterNameLength;

  return (
    <Modal
      title={t("report.title")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("report.cancel")}</Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() => onSubmit(targetName.trim(), reason, comment.trim())}
          >
            {t("report.submit")}
          </Button>
        </>
      }
    >
      {sent ? (
        <p role="status" className="text-sm text-green-300">
          {t("report.sent")}
        </p>
      ) : (
        <div className="space-y-4">
          <Input
            label={t("report.targetName")}
            aria-label={t("report.targetName")}
            value={targetName}
            maxLength={PROTOCOL_LIMITS.maxCharacterNameLength}
            onChange={(event) => setTargetName(event.target.value)}
          />
          <Dropdown
            ariaLabel={t("report.reason")}
            label={t("report.reason")}
            value={reason}
            options={REPORT_REASONS.map((entry) => ({
              value: entry,
              label: t(`report.reasons.${entry}`),
            }))}
            onChange={setReason}
          />
          <label className="flex flex-col gap-2">
            <span className="font-display text-xs font-semibold tracking-[0.18em] text-ui-gold uppercase">
              {t("report.comment")}
            </span>
            <textarea
              aria-label={t("report.comment")}
              value={comment}
              maxLength={REPORT_LIMITS.maxCommentLength}
              rows={4}
              onChange={(event) => setComment(event.target.value)}
              className="ui-scrollbar w-full resize-none rounded-lg border border-ui-stone/50 bg-black/40 px-3.5 py-2 font-tibia text-sm text-ui-text shadow-inner shadow-black/35 outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ui-muted/55 hover:border-ui-stone-light/45 focus:border-ui-gold/60 focus:bg-black/55 focus:ring-2 focus:ring-ui-gold/15"
            />
          </label>
          <p className="text-sm text-ui-muted">{t("report.hint")}</p>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
