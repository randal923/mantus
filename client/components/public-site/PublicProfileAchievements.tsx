"use client";

import type { PublicCharacterProfileData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicProfileSection } from "./PublicProfileSection";

interface PublicProfileAchievementsProps {
  readonly achievements: PublicCharacterProfileData["achievements"];
}

export function PublicProfileAchievements({
  achievements,
}: PublicProfileAchievementsProps) {
  const { t } = useAppTranslation();

  return (
    <PublicProfileSection title={t("publicProfile.accountAchievements")}>
      {achievements.length === 0 ? (
        <p className="px-[1.125rem] py-4 text-sm text-ui-muted">
          {t("publicProfile.noAchievements")}
        </p>
      ) : (
        <ul className="divide-y divide-white/5">
          {achievements.map((achievement) => (
            <li
              key={achievement.achievementId}
              className="grid gap-2 px-[1.125rem] py-3 sm:grid-cols-[11rem_minmax(0,1fr)_5rem] sm:items-center sm:gap-4"
            >
              <span className="font-display text-sm font-semibold text-[#e4e1da]">
                {achievement.name}
              </span>
              <span className="text-sm text-ui-muted">
                {achievement.description}
              </span>
              <span className="text-sm font-semibold text-[#c9a06a] sm:text-right">
                {t("publicProfile.points", {
                  points: achievement.points,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PublicProfileSection>
  );
}
