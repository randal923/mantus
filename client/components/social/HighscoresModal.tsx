"use client";

import { useState } from "react";
import {
  CHARACTER_VOCATIONS,
  HIGHSCORE_CATEGORIES,
  type CharacterVocation,
  type HighscoreCategory,
  type HighscoresStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Dropdown } from "../ui/Dropdown";
import { Modal } from "../ui/Modal";

interface HighscoresModalProps {
  page: HighscoresStateMessage | null;
  pending: boolean;
  error: string | null;
  onRequest: (
    category: HighscoreCategory,
    vocation: CharacterVocation | undefined,
    page: number,
  ) => void;
  onClose: () => void;
}

const ALL_VOCATIONS = "all" as const;

/**
 * Renders the bounded server highscore projection; ranking, filters, and
 * page depth are all enforced server-side.
 */
export function HighscoresModal({
  page,
  pending,
  error,
  onRequest,
  onClose,
}: HighscoresModalProps) {
  const { t } = useAppTranslation();
  const [category, setCategory] = useState<HighscoreCategory>(
    page?.category ?? "experience",
  );
  const [vocation, setVocation] = useState<
    CharacterVocation | typeof ALL_VOCATIONS
  >(page?.vocation ?? ALL_VOCATIONS);
  const selectedVocation = vocation === ALL_VOCATIONS ? undefined : vocation;
  const currentPage = page?.page ?? 0;
  const totalPages = page?.totalPages ?? 1;

  return (
    <Modal
      title={t("highscores.title")}
      onClose={onClose}
      size="wide"
      pagination={{
        currentPage: currentPage + 1,
        totalPages,
        disabled: pending,
        onPrevious: () =>
          onRequest(category, selectedVocation, currentPage - 1),
        onNext: () =>
          onRequest(category, selectedVocation, currentPage + 1),
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Dropdown
          ariaLabel={t("highscores.category")}
          label={t("highscores.category")}
          value={category}
          options={HIGHSCORE_CATEGORIES.map((entry) => ({
            value: entry,
            label: t(`highscores.categories.${entry}`),
          }))}
          onChange={(value) => {
            setCategory(value);
            onRequest(value, selectedVocation, 0);
          }}
          className="w-48"
        />
        <Dropdown
          ariaLabel={t("highscores.vocation")}
          label={t("highscores.vocation")}
          value={vocation}
          options={[
            { value: ALL_VOCATIONS, label: t("highscores.allVocations") },
            ...CHARACTER_VOCATIONS.map((entry) => ({
              value: entry,
              label: t(`vocations.${entry}.name`),
            })),
          ]}
          onChange={(value) => {
            setVocation(value);
            onRequest(
              category,
              value === ALL_VOCATIONS ? undefined : value,
              0,
            );
          }}
          className="w-48"
        />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ui-stone-light/20 text-[10px] tracking-widest text-ui-gold uppercase">
              <th className="w-14 py-2 pr-2">{t("highscores.rank")}</th>
              <th className="py-2 pr-2">{t("highscores.name")}</th>
              <th className="w-20 py-2 pr-2">{t("highscores.level")}</th>
              <th className="w-40 py-2 pr-2">{t("highscores.vocation")}</th>
              <th className="w-32 py-2 text-right">{t("highscores.value")}</th>
            </tr>
          </thead>
          <tbody>
            {(page?.entries ?? []).map((entry) => (
              <tr
                key={entry.rank}
                className="border-b border-ui-stone-light/10 last:border-b-0"
              >
                <td className="py-1.5 pr-2 text-ui-muted">{entry.rank}</td>
                <td className="py-1.5 pr-2 text-ui-text-bright">
                  {entry.name}
                </td>
                <td className="py-1.5 pr-2">{entry.level}</td>
                <td className="py-1.5 pr-2 text-ui-muted">
                  {t(`vocations.${entry.vocation}.name`)}
                </td>
                <td className="py-1.5 text-right font-medium text-ui-gold">
                  {entry.value.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pending && (page?.entries.length ?? 0) === 0 && (
          <p className="py-6 text-center text-xs text-ui-muted">
            {t("highscores.empty")}
          </p>
        )}
        {pending && (
          <p className="py-6 text-center text-xs text-ui-muted">
            {t("highscores.loading")}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-300">
          {error}
        </p>
      )}
    </Modal>
  );
}
