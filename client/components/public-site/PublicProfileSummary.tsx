"use client";

import type { PublicCharacterProfileData } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { OutfitPortrait } from "../characters/OutfitPortrait";
import { ButtonLink } from "../ui/ButtonLink";

interface PublicProfileSummaryProps {
  readonly profile: PublicCharacterProfileData;
}

export function PublicProfileSummary({
  profile,
}: PublicProfileSummaryProps) {
  const { t } = useAppTranslation();

  return (
    <section className="ui-panel-frame relative overflow-hidden">
      <div className="grid sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="relative flex min-h-44 items-center justify-center border-b border-ui-stone-light/20 bg-[radial-gradient(circle_at_center,rgba(143,30,22,0.28),rgba(0,0,0,0.48)_70%)] p-5 sm:border-r sm:border-b-0">
          <OutfitPortrait outfit={profile.outfit} fit={112} />
          <span
            className={`absolute right-3 bottom-3 flex items-center gap-2 border px-2 py-1 text-xs font-medium ${
              profile.online
                ? "border-ui-success/50 bg-ui-success/15 text-ui-text-bright"
                : "border-ui-stone-light/20 bg-black/35 text-ui-muted"
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
          <p className="font-display text-xs font-bold tracking-widest text-ui-accent-light uppercase">
            {t("publicProfile.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-wide text-ui-text-bright uppercase">
            {profile.name}
          </h1>
          <p className="mt-1 text-sm text-ui-gold">
            {profile.title ?? t("publicProfile.noTitle")}
          </p>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="border-l border-ui-accent/60 pl-3">
              <dt className="text-xs tracking-wide text-ui-muted uppercase">
                {t("publicProfile.level")}
              </dt>
              <dd className="mt-1 font-display text-sm font-bold text-ui-text-bright">
                {profile.level.toLocaleString()}
              </dd>
            </div>
            <div className="border-l border-ui-accent/60 pl-3">
              <dt className="text-xs tracking-wide text-ui-muted uppercase">
                {t("publicProfile.vocation")}
              </dt>
              <dd className="mt-1 font-display text-sm font-bold text-ui-text-bright">
                {t(`vocations.${profile.vocation}.name`)}
              </dd>
            </div>
            <div className="border-l border-ui-accent/60 pl-3">
              <dt className="text-xs tracking-wide text-ui-muted uppercase">
                {t("publicProfile.world")}
              </dt>
              <dd className="mt-1 font-display text-sm font-bold text-ui-text-bright">
                {profile.worldName}
              </dd>
            </div>
          </dl>

          {profile.badges.length > 0 && (
            <div className="mt-5 border-t border-ui-stone-light/15 pt-4">
              <p className="text-xs tracking-wide text-ui-muted uppercase">
                {t("publicProfile.badges")}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {profile.badges.map((badge) => (
                  <li
                    key={badge.badgeId}
                    className="border border-ui-gold/25 bg-ui-gold/5 px-2 py-1 font-display text-xs font-bold text-ui-gold"
                  >
                    {badge.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ButtonLink href="/characters" size="sm" className="mt-5 w-fit">
            {t("publicProfile.anotherCharacter")}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
