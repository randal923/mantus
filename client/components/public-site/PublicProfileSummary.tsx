"use client";

import type { PublicCharacterProfileData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import Link from "next/link";
import { OutfitPortrait } from "../characters/OutfitPortrait";

interface PublicProfileSummaryProps {
  readonly profile: PublicCharacterProfileData;
}

export function PublicProfileSummary({
  profile,
}: PublicProfileSummaryProps) {
  const { t } = useAppTranslation();

  return (
    <section className="portal-box portal-box-warm overflow-hidden">
      <div className="grid sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="relative flex min-h-44 items-center justify-center border-b border-white/10 bg-[radial-gradient(circle_at_center,rgba(143,30,22,0.28),rgba(0,0,0,0.48)_70%)] p-5 sm:border-r sm:border-b-0">
          <OutfitPortrait outfit={profile.outfit} fit={112} />
          <span
            className={`absolute right-3 bottom-3 flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium ${
              profile.online
                ? "border-ui-success/50 bg-ui-success/15 text-ui-text-bright"
                : "border-white/10 bg-black/35 text-ui-muted"
            }`}
          >
            <span
              className={`size-2 rounded-full ${
                profile.online ? "bg-ui-success" : "bg-ui-muted"
              }`}
            />
            {profile.online
              ? t("publicProfile.online")
              : t("publicProfile.offline")}
          </span>
        </div>

        <div className="flex min-w-0 flex-col p-5 sm:p-6">
          <p className="font-display text-[0.6875rem] font-normal tracking-[0.24em] text-[#a8524c] uppercase">
            {t("publicProfile.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
            {profile.name}
          </h1>
          <p className="mt-1 text-sm text-[#c9a06a]">
            {profile.title ?? t("publicProfile.noTitle")}
          </p>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="border-l-2 border-[#7e1f1f] pl-3">
              <dt className="text-xs tracking-wide text-ui-muted uppercase">
                {t("publicProfile.level")}
              </dt>
              <dd className="mt-1 font-display text-sm font-bold text-ui-text-bright">
                {profile.level.toLocaleString()}
              </dd>
            </div>
            <div className="border-l-2 border-[#7e1f1f] pl-3">
              <dt className="text-xs tracking-wide text-ui-muted uppercase">
                {t("publicProfile.vocation")}
              </dt>
              <dd className="mt-1 font-display text-sm font-bold text-ui-text-bright">
                {t(`vocations.${profile.vocation}.name`)}
              </dd>
            </div>
            <div className="border-l-2 border-[#7e1f1f] pl-3">
              <dt className="text-xs tracking-wide text-ui-muted uppercase">
                {t("publicProfile.world")}
              </dt>
              <dd className="mt-1 font-display text-sm font-bold text-ui-text-bright">
                {profile.worldName}
              </dd>
            </div>
          </dl>

          {profile.badges.length > 0 && (
            <div className="mt-5 border-t border-white/5 pt-4">
              <p className="text-xs tracking-wide text-ui-muted uppercase">
                {t("publicProfile.badges")}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {profile.badges.map((badge) => (
                  <li
                    key={badge.badgeId}
                    className="rounded-md border border-white/10 px-2 py-1 font-display text-xs text-[#c9a06a]"
                  >
                    {badge.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            href="/characters"
            className="portal-btn-ghost mt-5 w-fit px-5 py-2.5"
          >
            {t("publicProfile.anotherCharacter")}
          </Link>
        </div>
      </div>
    </section>
  );
}
