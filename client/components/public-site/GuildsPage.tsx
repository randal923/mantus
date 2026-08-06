"use client";

import { publicGuildsDataSchema } from "@tibia/protocol";
import Link from "next/link";
import { usePublicApiData } from "../../hooks/usePublicApiData";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { PublicSiteLayout } from "./PublicSiteLayout";

export function GuildsPage() {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const dateLocale = language === "pt-BR" ? "pt-BR" : "en-US";
  const guilds = usePublicApiData("/api/public/guilds", publicGuildsDataSchema);

  return (
    <PublicSiteLayout>
      <section className="ui-panel-frame relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-stone-light/15 bg-black/30 px-5 py-4">
          <h2 className="font-display text-sm font-bold tracking-widest text-ui-text-bright uppercase">
            {t("websiteGuilds.title")}
          </h2>
          {guilds.data && (
            <p className="text-sm text-ui-muted">
              {t("websiteGuilds.count", { count: guilds.data.guilds.length })}
            </p>
          )}
        </div>

        {guilds.status === "loading" && (
          <p className="p-8 text-center text-sm text-ui-muted">
            {t("common.loading")}…
          </p>
        )}
        {(guilds.status === "unavailable" ||
          guilds.status === "not-found") && (
          <p className="p-8 text-center text-sm text-ui-muted">
            {t("publicSite.unavailable")}
          </p>
        )}
        {guilds.data && guilds.data.guilds.length === 0 && (
          <p className="p-8 text-center text-sm text-ui-muted">
            {t("websiteGuilds.empty")}
          </p>
        )}
        {guilds.data && guilds.data.guilds.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl border-collapse text-left text-sm">
              <thead className="border-b border-ui-stone-light/15 bg-white/3 text-xs tracking-wide text-ui-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">
                    {t("websiteGuilds.guild")}
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("websiteGuilds.members")}
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("websiteGuilds.founded")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-stone-light/10">
                {guilds.data.guilds.map((guild) => (
                  <tr
                    key={guild.name}
                    className="transition-colors hover:bg-white/3"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/guilds/${encodeURIComponent(guild.name)}`}
                        className="font-medium text-ui-text-bright hover:text-ui-accent-light"
                      >
                        {guild.name}
                      </Link>
                      {guild.motd && (
                        <p className="mt-0.5 max-w-md text-xs leading-5 text-ui-muted">
                          {guild.motd}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-ui-text tabular-nums">
                      {guild.memberCount.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap text-ui-muted">
                      {new Intl.DateTimeFormat(dateLocale, {
                        dateStyle: "medium",
                      }).format(new Date(guild.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PublicSiteLayout>
  );
}
