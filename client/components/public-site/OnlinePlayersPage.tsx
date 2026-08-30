"use client";

import { publicOnlineDataSchema } from "@tibia/protocol";
import Link from "next/link";
import { usePublicApiData } from "../../hooks/usePublicApiData";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicSiteLayout } from "./PublicSiteLayout";

export function OnlinePlayersPage() {
  const { t } = useAppTranslation();
  const online = usePublicApiData(
    "/api/public/online",
    publicOnlineDataSchema,
  );

  return (
    <PublicSiteLayout>
      <section className="portal-box overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-[1.125rem] py-3">
          <h2 className="font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
            {t("online.world")}
          </h2>
          <p className="flex items-center gap-2 text-sm text-ui-text">
            <span className="size-2 rounded-full bg-ui-success shadow-[0_0_12px_rgba(97,119,88,0.8)]" />
            {online.data
              ? t("online.count", { count: online.data.playersOnline })
              : t("online.statusPending")}
          </p>
        </div>

        {online.status === "loading" && (
          <p className="p-8 text-center text-sm text-ui-muted">
            {t("common.loading")}…
          </p>
        )}
        {(online.status === "unavailable" ||
          online.status === "not-found") && (
          <p className="p-8 text-center text-sm text-ui-muted">
            {t("publicSite.unavailable")}
          </p>
        )}
        {online.data && online.data.players.length === 0 && (
          <p className="p-8 text-center text-sm text-ui-muted">
            {t("online.empty")}
          </p>
        )}
        {online.data && online.data.players.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-white/5 text-[0.6875rem] tracking-[0.16em] text-[#66625e] uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">{t("online.name")}</th>
                  <th className="px-5 py-3 font-medium">
                    {t("online.vocation")}
                  </th>
                  <th className="px-5 py-3 font-medium">{t("online.guild")}</th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("online.level")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {online.data.players.map((player) => (
                  <tr
                    key={player.name}
                    className="transition-colors hover:bg-white/3"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/characters/${encodeURIComponent(player.name)}`}
                        className="text-[#b8b3ac] transition-colors hover:text-ui-text-bright"
                      >
                        {player.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ui-text">
                      {t(`vocations.${player.vocation}.name`)}
                    </td>
                    <td className="px-5 py-3 text-ui-muted">
                      {player.guildName ?? t("online.noGuild")}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-ui-text-bright">
                      {player.level.toLocaleString()}
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
