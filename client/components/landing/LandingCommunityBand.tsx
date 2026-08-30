"use client";

import { DISCORD_INVITE_URL } from "../../lib/public/communityLinks";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { DiscordIcon } from "../ui/DiscordIcon";

/** Wide community section with Discord/forum actions. */
export function LandingCommunityBand() {
  const { t } = useAppTranslation();

  return (
    <section className="portal-box flex flex-wrap items-center justify-between gap-x-10 gap-y-7 p-8 sm:p-10">
      <div>
        <h2 className="mb-2.5 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
          {t("landing.community.title")}
        </h2>
        <p className="max-w-md text-[0.9375rem] leading-relaxed text-[#8a8681]">
          {t("landing.community.description")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-3">
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="portal-btn-ghost px-6 py-3"
        >
          <DiscordIcon className="size-4" />
          {t("landing.community.discord")}
        </a>
      </div>
    </section>
  );
}
