"use client";

import { useState } from "react";
import type {
  CharacterVocation,
  ProfileStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { summarizeProfileProgress } from "../../lib/profile/summarizeProfileProgress";
import { Modal } from "../ui/Modal";
import { AchievementList } from "./AchievementList";
import { TitlePicker } from "./TitlePicker";

type ProfileTab = "achievements" | "titles" | "badges";

interface ProfileModalProps {
  profile: ProfileStateMessage | null;
  characterName: string;
  level: number;
  vocation: CharacterVocation;
  pending: boolean;
  error: string | null;
  onSelectTitle: (titleId: string | null) => void;
  onClose: () => void;
}

/**
 * The own profile window over the private `profile-state` projection.
 * Title selection only sends an intent; grants are re-checked server-side.
 */
export function ProfileModal({
  profile,
  characterName,
  level,
  vocation,
  pending,
  error,
  onSelectTitle,
  onClose,
}: ProfileModalProps) {
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<ProfileTab>("achievements");
  const tabs: ReadonlyArray<ProfileTab> = [
    "achievements",
    "titles",
    "badges",
  ];
  const selectedTitleName = profile
    ? (profile.titles.find(
        (title) => title.titleId === profile.selectedTitle,
      )?.name ?? null)
    : null;
  const summary = profile
    ? summarizeProfileProgress(profile.achievements)
    : null;

  return (
    <Modal
      size="wide"
      title={t("profile.title")}
      onClose={onClose}
      tabs={{
        label: t("profile.tabsLabel"),
        selected: tab,
        items: tabs.map((id) => ({
          id,
          label: t(`profile.tabs.${id}`),
        })),
        onSelect: (id) => setTab(id as ProfileTab),
      }}
    >
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-ui-gold/15 bg-black/20 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-bold tracking-wide text-ui-text-bright">
              {characterName}
            </p>
            <p className="mt-0.5 text-xs tracking-wide text-ui-muted">
              {t("profile.levelVocation", {
                level,
                vocation: t(`vocations.${vocation}.name`),
              })}
            </p>
            {selectedTitleName && (
              <p className="mt-0.5 truncate text-xs text-ui-gold">
                {t("profile.currentTitle", { title: selectedTitleName })}
              </p>
            )}
          </div>
          {profile && summary && (
            <div className="flex shrink-0 flex-col items-end gap-1 text-sm">
              <span className="rounded-full border border-ui-gold/25 bg-ui-gold-deep/40 px-3 py-1 font-bold tabular-nums text-ui-text-bright">
                {t("profile.pointsLabel")}: {profile.points}
              </span>
              <span className="tabular-nums text-ui-muted">
                {t("profile.progress", {
                  granted: summary.grantedCount,
                  total: summary.totalCount,
                })}
              </span>
            </div>
          )}
        </header>

        {!profile && (
          <p role="status" className="text-sm text-ui-muted">
            {t("profile.loading")}
          </p>
        )}

        {profile && tab === "achievements" && (
          <>
            {summary && summary.hiddenCount > 0 && (
              <p className="text-xs text-ui-muted">
                {t("profile.hiddenCount", { count: summary.hiddenCount })}
              </p>
            )}
            <AchievementList achievements={profile.achievements} />
          </>
        )}

        {profile && tab === "titles" && (
          <TitlePicker
            titles={profile.titles}
            selectedTitle={profile.selectedTitle}
            pending={pending}
            onSelectTitle={onSelectTitle}
          />
        )}

        {profile && tab === "badges" && (
          <>
            {profile.badges.length === 0 ? (
              <p className="text-sm text-ui-muted">
                {t("profile.noBadges")}
              </p>
            ) : (
              <ul
                aria-label={t("profile.badgesLabel")}
                className="flex flex-wrap gap-2"
              >
                {profile.badges.map((badge) => (
                  <li
                    key={badge.badgeId}
                    className="rounded-full border border-ui-gold/25 bg-black/25 px-3 py-1 text-sm text-ui-text-bright"
                  >
                    {badge.name}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
