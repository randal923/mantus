"use client";

import { useState } from "react";
import type { BosstiaryStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";
import { BosstiaryCard } from "./BosstiaryCard";

const PAGE_SIZE = 12;

interface BosstiaryModalProps {
  bosses: BosstiaryStateMessage | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
}

/** Boss grid with Prowess/Expertise/Mastery stars and total boss points. */
export function BosstiaryModal({
  bosses,
  pending,
  error,
  onClose,
}: BosstiaryModalProps) {
  const { t } = useAppTranslation();
  const [page, setPage] = useState(0);
  const entries = bosses?.entries ?? [];
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visible = entries.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  return (
    <Modal
      title={t("bosstiary.title")}
      onClose={onClose}
      size="wide"
      pagination={
        totalPages > 1
          ? {
              currentPage: currentPage + 1,
              totalPages,
              disabled: pending,
              onPrevious: () => setPage(currentPage - 1),
              onNext: () => setPage(currentPage + 1),
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ui-muted">{t("bosstiary.subtitle")}</span>
        {bosses && (
          <span className="text-xs text-ui-gold">
            {t("bosstiary.bossPoints", {
              points: bosses.bossPoints.toLocaleString(),
            })}
          </span>
        )}
      </div>
      <div>
        {bosses ? (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {visible.map((entry) => (
                <li key={entry.raceId}>
                  <BosstiaryCard entry={entry} />
                </li>
              ))}
            </ul>
            {entries.length === 0 && !pending && (
              <p className="py-6 text-center text-xs text-ui-muted">
                {t("bosstiary.empty")}
              </p>
            )}
          </>
        ) : (
          <p className="py-6 text-center text-xs text-ui-muted">
            {t("bestiary.loading")}
          </p>
        )}
      </div>
      {error && !pending && (
        <p role="alert" className="text-xs text-red-300">
          {t(`bestiary.errors.${error}`, { defaultValue: error })}
        </p>
      )}
    </Modal>
  );
}
