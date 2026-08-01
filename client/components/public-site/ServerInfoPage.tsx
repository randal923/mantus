"use client";

import {
  publicServerInfoDataSchema,
  type PublicServerInfoData,
} from "@tibia/protocol";
import { usePublicApiData } from "../../hooks/usePublicApiData";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicSiteLayout } from "./PublicSiteLayout";

const RATE_KEYS = [
  "experience",
  "skill",
  "magic",
  "loot",
  "spawn",
  "soulRegen",
  "offlineTraining",
  "exerciseTraining",
  "bestiaryKills",
  "bosstiaryKills",
] as const satisfies ReadonlyArray<keyof PublicServerInfoData["rates"]>;

const SYSTEM_KEYS = [
  "stamina",
  "experienceStages",
  "market",
  "houses",
  "guildWars",
  "dailyRewards",
] as const satisfies ReadonlyArray<keyof PublicServerInfoData["systems"]>;

export function ServerInfoPage() {
  const { t } = useAppTranslation();
  const info = usePublicApiData(
    "/api/public/server-info",
    publicServerInfoDataSchema,
  );
  const data = info.data;

  return (
    <PublicSiteLayout>
      <div className="grid gap-5 lg:grid-cols-2">
        {info.status === "loading" && (
          <section className="ui-panel-frame relative p-10 text-center text-sm text-ui-muted lg:col-span-2">
            {t("common.loading")}…
          </section>
        )}
        {(info.status === "unavailable" || info.status === "not-found") && (
          <section className="ui-panel-frame relative p-10 text-center text-sm text-ui-muted lg:col-span-2">
            {t("publicSite.unavailable")}
          </section>
        )}
        {data && (
          <>
            <section className="ui-panel-frame relative overflow-hidden lg:col-span-2">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4">
                <div className="border-b border-ui-stone-light/10 p-5 sm:border-r lg:border-b-0">
                  <p className="text-xs tracking-wide text-ui-muted uppercase">
                    {t("serverInfo.world")}
                  </p>
                  <p className="mt-2 font-display text-lg font-bold text-ui-text-bright">
                    {data.worldName}
                  </p>
                </div>
                <div className="border-b border-ui-stone-light/10 p-5 lg:border-r lg:border-b-0">
                  <p className="text-xs tracking-wide text-ui-muted uppercase">
                    {t("serverInfo.status")}
                  </p>
                  <p className="mt-2 flex items-center gap-2 font-display text-lg font-bold text-ui-text-bright">
                    <span className="size-2 rounded-full bg-ui-success shadow-[0_0_12px_rgba(97,119,88,0.8)]" />
                    {t("serverInfo.online")}
                  </p>
                </div>
                <div className="border-b border-ui-stone-light/10 p-5 sm:border-r sm:border-b-0">
                  <p className="text-xs tracking-wide text-ui-muted uppercase">
                    {t("serverInfo.players")}
                  </p>
                  <p className="mt-2 font-display text-lg font-bold text-ui-text-bright">
                    {data.playersOnline.toLocaleString()} /{" "}
                    {data.maxPlayers.toLocaleString()}
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-xs tracking-wide text-ui-muted uppercase">
                    {t("serverInfo.worldType")}
                  </p>
                  <p className="mt-2 font-display text-lg font-bold text-ui-text-bright">
                    {t("serverInfo.openPvp")}
                  </p>
                </div>
              </div>
            </section>

            <section className="ui-panel-frame relative overflow-hidden">
              <h2 className="border-b border-ui-stone-light/15 bg-black/30 px-5 py-4 font-display text-sm font-bold tracking-widest text-ui-text-bright uppercase">
                {t("serverInfo.ratesTitle")}
              </h2>
              <dl className="divide-y divide-ui-stone-light/10">
                {RATE_KEYS.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 px-5 py-3 odd:bg-white/2"
                  >
                    <dt className="text-sm text-ui-text">
                      {t(`serverInfo.rates.${key}`)}
                    </dt>
                    <dd className="font-display text-sm font-bold text-ui-gold">
                      {data.rates[key]}x
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="ui-panel-frame relative overflow-hidden">
              <h2 className="border-b border-ui-stone-light/15 bg-black/30 px-5 py-4 font-display text-sm font-bold tracking-widest text-ui-text-bright uppercase">
                {t("serverInfo.systemsTitle")}
              </h2>
              <dl className="divide-y divide-ui-stone-light/10">
                {SYSTEM_KEYS.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 px-5 py-3 odd:bg-white/2"
                  >
                    <dt className="text-sm text-ui-text">
                      {t(`serverInfo.systems.${key}`)}
                    </dt>
                    <dd
                      className={`text-xs font-bold tracking-wide uppercase ${
                        data.systems[key]
                          ? "text-ui-success"
                          : "text-ui-muted"
                      }`}
                    >
                      {data.systems[key]
                        ? t("serverInfo.enabled")
                        : t("serverInfo.disabled")}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="ui-panel-frame relative overflow-hidden p-6 lg:col-span-2">
              <p className="font-display text-xs font-bold tracking-widest text-ui-accent-light uppercase">
                {t("serverInfo.rulesEyebrow")}
              </p>
              <h2 className="mt-2 font-display text-xl font-bold tracking-wide text-ui-text-bright uppercase">
                {t("serverInfo.rulesTitle")}
              </h2>
              <div className="mt-5 grid gap-4 text-sm leading-6 text-ui-text md:grid-cols-3">
                <p className="border-l-2 border-ui-accent/60 pl-4">
                  {t("serverInfo.rules.authority")}
                </p>
                <p className="border-l-2 border-ui-accent/60 pl-4">
                  {t("serverInfo.rules.economy")}
                </p>
                <p className="border-l-2 border-ui-accent/60 pl-4">
                  {t("serverInfo.rules.pvp")}
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </PublicSiteLayout>
  );
}
