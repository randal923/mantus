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
        <p className="m-3 bg-white/6 px-4 py-3 text-sm text-ui-muted sm:m-4">
          {t("publicProfile.noAchievements")}
        </p>
      ) : (
        <ul className="m-3 divide-y divide-ui-stone-light/15 overflow-hidden border border-ui-stone-light/15 sm:m-4">
          {achievements.map((achievement, index) => (
            <li
              key={achievement.achievementId}
              className={`grid gap-2 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_5rem] sm:items-center sm:gap-4 ${
                index % 2 === 0 ? "bg-white/6" : "bg-black/15"
              }`}
            >
              <span className="font-display text-sm font-bold text-ui-text-bright">
                {achievement.name}
              </span>
              <span className="text-sm text-ui-muted">
                {achievement.description}
              </span>
              <span className="text-sm font-bold text-ui-gold sm:text-right">
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
