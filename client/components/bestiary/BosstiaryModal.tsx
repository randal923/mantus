"use client";

import { useState } from "react";
import type { BosstiaryStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
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
    <Modal title={t("bosstiary.title")} onClose={onClose} size="wide">
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
      <div className="min-h-64 overflow-y-auto">
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
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  disabled={currentPage <= 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  {t("bestiary.previous")}
                </Button>
                <span className="text-xs text-ui-muted">
                  {t("bestiary.pageOf", {
                    page: currentPage + 1,
                    total: totalPages,
                  })}
                </span>
                <Button
                  size="sm"
                  disabled={currentPage + 1 >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  {t("bestiary.next")}
                </Button>
              </div>
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
