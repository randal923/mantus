"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLandingWorldData } from "../landing/useLandingWorldData";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { DiscordIcon } from "../ui/DiscordIcon";
import { LanguageFlagButtons } from "../ui/LanguageFlagButtons";

/** Thin status bar above the header: live player count, Discord, language. */
export function PublicSiteTopbar() {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const world = useLandingWorldData();
  const data = world.data;

  return (
    <div className="relative z-40 flex h-10 items-center justify-between gap-4 border-b border-white/5 bg-[#080808]/75 px-4 text-xs text-[#6e6a66] backdrop-blur-sm sm:px-8">
      <div className="flex min-w-0 items-center gap-2">
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
          href="#"
          className="flex items-center gap-2 transition-colors hover:text-ui-text-bright"
        >
          <DiscordIcon className="size-4" />
          {t("landing.community.discord")}
        </a>
        <span aria-hidden className="h-3.5 w-px bg-white/10" />
        <LanguageFlagButtons language={language} onChange={setLanguage} />
      </div>
    </div>
  );
}
