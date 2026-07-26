"use client";

import type { CharacterProfileMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Modal } from "../ui/Modal";
import { AchievementList } from "./AchievementList";

interface PublicProfileModalProps {
  profile: CharacterProfileMessage | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
}

/**
 * Another character's public board, rendered exactly as received. The
 * projection deliberately omits position, health, and online state; do not
 * enrich it from the local creature cache (charter rule 6).
 */
export function PublicProfileModal({
  profile,
  pending,
  error,
  onClose,
}: PublicProfileModalProps) {
  const { t } = useAppTranslation();

  return (
    <Modal
      size="wide"
      title={profile ? profile.name : t("profile.publicTitle")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="text-sm text-ui-muted">
            {error}
          </p>
        )}
        {!error && !profile && pending && (
          <p role="status" className="text-sm text-ui-muted">
            {t("profile.loading")}
          </p>
        )}
        {!error && profile && (
          <>
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-ui-gold/15 bg-black/20 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-base font-bold tracking-wide text-ui-text-bright">
                  {profile.name}
                </p>
                <p className="mt-0.5 text-xs tracking-wide text-ui-muted">
                  {t("profile.levelVocation", {
                    level: profile.level,
                    vocation: t(`vocations.${profile.vocation}.name`),
                  })}
                </p>
                {profile.title && (
                  <p className="mt-0.5 truncate text-xs text-ui-gold">
                    {t("profile.currentTitle", { title: profile.title })}
                  </p>
                )}
                {profile.guildName && (
                  <p className="mt-0.5 truncate text-xs text-ui-muted">
                    {t("profile.guild", { guild: profile.guildName })}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full border border-ui-gold/25 bg-ui-gold-deep/40 px-3 py-1 text-sm font-bold tabular-nums text-ui-text-bright">
                {t("profile.pointsLabel")}: {profile.points}
              </span>
            </header>
            {profile.badges.length > 0 && (
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
            <AchievementList achievements={profile.achievements} />
          </>
        )}
      </div>
    </Modal>
  );
}
