"use client";

import {
  publicServerInfoDataSchema,
  type PublicServerInfoData,
} from "@tibia/protocol";
import { usePublicApiData } from "../../hooks/usePublicApiData";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicSiteLayout } from "./PublicSiteLayout";
import { ServerInfoStageTable } from "./ServerInfoStageTable";

/** Rates the stage tables override whenever experience stages are enabled. */
const STAGED_RATE_KEYS: ReadonlySet<string> = new Set([
  "experience",
  "skill",
  "magic",
]);

const STAGE_KEYS = [
  "experience",
  "skill",
  "magic",
] as const satisfies ReadonlyArray<keyof PublicServerInfoData["stages"]>;

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
          <section className="portal-box p-10 text-center text-sm text-ui-muted lg:col-span-2">
            {t("common.loading")}…
          </section>
        )}
        {(info.status === "unavailable" || info.status === "not-found") && (
          <section className="portal-box p-10 text-center text-sm text-ui-muted lg:col-span-2">
            {t("publicSite.unavailable")}
          </section>
        )}
        {data && (
          <>
            <section className="portal-box overflow-hidden lg:col-span-2">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4">
                <div className="border-b border-white/5 p-5 sm:border-r lg:border-b-0">
                  <p className="text-xs tracking-wide text-ui-muted uppercase">
                    {t("serverInfo.world")}
                  </p>
                  <p className="mt-2 font-display text-lg font-semibold text-[#e4e1da]">
                    {data.worldName}
                  </p>
                </div>
                <div className="border-b border-white/5 p-5 lg:border-r lg:border-b-0">
                  <p className="text-xs tracking-wide text-ui-muted uppercase">
                    {t("serverInfo.status")}
                  </p>
                  <p className="mt-2 flex items-center gap-2 font-display text-lg font-semibold text-[#e4e1da]">
                    <span className="size-2 rounded-full bg-ui-success shadow-[0_0_12px_rgba(97,119,88,0.8)]" />
                    {t("serverInfo.online")}
                  </p>
                </div>
                <div className="border-b border-white/5 p-5 sm:border-r sm:border-b-0">
                  <p className="text-xs tracking-wide text-ui-muted uppercase">
                    {t("serverInfo.players")}
                  </p>
                  <p className="mt-2 font-display text-lg font-semibold text-[#e4e1da]">
                    {data.playersOnline.toLocaleString()} /{" "}
                    {data.maxPlayers.toLocaleString()}
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-xs tracking-wide text-ui-muted uppercase">
                    {t("serverInfo.worldType")}
                  </p>
                  <p className="mt-2 font-display text-lg font-semibold text-[#e4e1da]">
                    {t("serverInfo.openPvp")}
                  </p>
                </div>
              </div>
            </section>

            <section className="portal-box overflow-hidden">
              <h2 className="border-b border-white/5 px-[1.125rem] py-3 font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
                {t("serverInfo.ratesTitle")}
              </h2>
              <dl className="divide-y divide-white/5">
                {RATE_KEYS.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <dt className="text-sm text-ui-text">
                      {t(`serverInfo.rates.${key}`)}
                    </dt>
                    <dd className="font-display text-sm font-semibold text-[#c9a06a]">
                      {data.stages.experience.length > 0 &&
                      STAGED_RATE_KEYS.has(key)
                        ? t("serverInfo.staged")
                        : `${data.rates[key]}x`}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="portal-box overflow-hidden">
              <h2 className="border-b border-white/5 px-[1.125rem] py-3 font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
                {t("serverInfo.systemsTitle")}
              </h2>
              <dl className="divide-y divide-white/5">
                {SYSTEM_KEYS.map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 px-5 py-3"
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

            {data.stages.experience.length > 0 && (
              <section className="portal-box overflow-hidden lg:col-span-2">
                <h2 className="border-b border-white/5 px-[1.125rem] py-3 font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
                  {t("serverInfo.stagesTitle")}
                </h2>
                <p className="border-b border-white/5 px-5 py-3 text-sm text-ui-muted">
                  {t("serverInfo.stagesDescription")}
                </p>
                <div className="grid md:grid-cols-3">
                  {STAGE_KEYS.map((key) => (
                    <ServerInfoStageTable
                      key={key}
                      title={t(`serverInfo.stages.${key}`)}
                      rows={data.stages[key]}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="portal-box portal-box-warm overflow-hidden p-6 lg:col-span-2">
              <p className="font-display text-[0.6875rem] font-normal tracking-[0.24em] text-[#a8524c] uppercase">
                {t("serverInfo.rulesEyebrow")}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
                {t("serverInfo.rulesTitle")}
              </h2>
              <div className="mt-5 grid gap-4 text-sm leading-6 text-ui-text md:grid-cols-3">
                <p className="border-l-2 border-[#7e1f1f] pl-4">
                  {t("serverInfo.rules.authority")}
                </p>
                <p className="border-l-2 border-[#7e1f1f] pl-4">
                  {t("serverInfo.rules.economy")}
                </p>
                <p className="border-l-2 border-[#7e1f1f] pl-4">
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
