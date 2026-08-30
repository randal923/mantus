"use client";

import Link from "next/link";
import { DISCORD_INVITE_URL } from "../../lib/public/communityLinks";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLandingWorldData } from "../landing/useLandingWorldData";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { DiscordIcon } from "../ui/DiscordIcon";
import { LanguageFlagButtons } from "../ui/LanguageFlagButtons";
import { MantusLogo } from "../ui/MantusLogo";

/** Thin status bar at the top of the site: logo, live player count, Discord, language. */
export function PublicSiteTopbar() {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const world = useLandingWorldData();
  const data = world.data;

  return (
    <div className="relative z-40 border-b border-white/5 bg-[#080808]/75 text-xs text-[#6e6a66] backdrop-blur-sm">
      <div className="mx-auto flex min-h-12 w-full max-w-7xl items-center justify-between gap-4 px-4 py-1.5 sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <Link
          href="/"
          aria-label={t("brand.name")}
          className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ui-gold/60"
        >
          <MantusLogo size="sm" />
        </Link>
        {data && (
          <>
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-ui-success-light shadow-[0_0_8px_rgba(143,175,127,0.9)]"
            />
            <span className="truncate">
              {t("landing.world.status.players", { count: data.playersOnline })}
            </span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <a
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 transition-colors hover:text-ui-text-bright"
        >
          <DiscordIcon className="size-4" />
          {t("landing.community.discord")}
        </a>
        <span aria-hidden className="h-3.5 w-px bg-white/10" />
          <LanguageFlagButtons language={language} onChange={setLanguage} />
        </div>
      </div>
    </div>
  );
}
