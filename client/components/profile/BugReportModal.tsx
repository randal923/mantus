"use client";

import { useState } from "react";
import { PROFILE_LIMITS, type BugReportMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Modal } from "../ui/Modal";

const BUG_REPORT_CATEGORIES: ReadonlyArray<BugReportMessage["category"]> = [
  "bug",
  "typo",
  "map",
  "other",
];

interface BugReportModalProps {
  pending: boolean;
  error: string | null;
  onReport: (
    category: BugReportMessage["category"],
    message: string,
  ) => void;
  onClose: () => void;
}

/**
 * Ctrl+Z bug report. Sends only category and text — the reporter and their
 * position are server-derived, and the server enforces the rate limits.
 */
export function BugReportModal({
  pending,
  error,
  onReport,
  onClose,
}: BugReportModalProps) {
  const { t } = useAppTranslation();
  const [category, setCategory] =
    useState<BugReportMessage["category"]>("bug");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const showSent = submitted && !error;
  const canSubmit = !pending && !showSent && message.trim().length > 0;

  return (
    <Modal
      title={t("profile.bugReport.title")}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t("profile.bugReport.cancel")}</Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() => {
              onReport(category, message.trim());
              setSubmitted(true);
            }}
          >
            {t("profile.bugReport.submit")}
          </Button>
        </>
      }
    >
      {showSent ? (
        <p role="status" className="text-sm text-green-300">
          {t("profile.bugReport.sent")}
        </p>
      ) : (
        <div className="space-y-4">
          <Dropdown
            ariaLabel={t("profile.bugReport.category")}
            label={t("profile.bugReport.category")}
            value={category}
            options={BUG_REPORT_CATEGORIES.map((entry) => ({
              value: entry,
              label: t(`profile.bugReport.categories.${entry}`),
            }))}
            onChange={setCategory}
          />
          <label className="flex flex-col gap-2">
            <span className="font-display text-xs font-semibold tracking-[0.18em] text-ui-gold uppercase">
              {t("profile.bugReport.message")}
            </span>
            <textarea
              aria-label={t("profile.bugReport.message")}
              value={message}
              maxLength={PROFILE_LIMITS.maxBugReportLength}
              rows={5}
              onChange={(event) => setMessage(event.target.value)}
              className="ui-scrollbar w-full resize-none rounded-lg border border-ui-stone/50 bg-black/40 px-3.5 py-2 font-tibia text-sm text-ui-text shadow-inner shadow-black/35 outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ui-muted/55 hover:border-ui-stone-light/45 focus:border-ui-gold/60 focus:bg-black/55 focus:ring-2 focus:ring-ui-gold/15"
            />
            <span className="self-end text-xs tabular-nums text-ui-muted">
              {t("profile.bugReport.counter", {
                used: message.length,
                max: PROFILE_LIMITS.maxBugReportLength,
              })}
            </span>
          </label>
          <p className="text-sm text-ui-muted">
            {t("profile.bugReport.hint")}
          </p>
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
