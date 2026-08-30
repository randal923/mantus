"use client";

import { publicGuildProfileDataSchema } from "@tibia/protocol";
import Link from "next/link";
import { Fragment } from "react";
import { usePublicApiData } from "../../hooks/usePublicApiData";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { ButtonLink } from "../ui/ButtonLink";
import { PublicSiteLayout } from "./PublicSiteLayout";

interface GuildProfilePageProps {
  readonly name: string;
}

export function GuildProfilePage({ name }: GuildProfilePageProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const dateLocale = language === "pt-BR" ? "pt-BR" : "en-US";
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(
      new Date(value),
    );
  const guild = usePublicApiData(
    `/api/public/guilds/${encodeURIComponent(name)}`,
    publicGuildProfileDataSchema,
  );
  const data = guild.data;

  return (
    <PublicSiteLayout>
      <div className="grid gap-5">
        {guild.status === "loading" && (
          <section className="portal-box p-10 text-center text-sm text-ui-muted">
            {t("common.loading")}…
          </section>
        )}
        {guild.status === "unavailable" && (
          <section className="portal-box p-10 text-center text-sm text-ui-muted">
            {t("publicSite.unavailable")}
          </section>
        )}
        {guild.status === "not-found" && (
          <section className="portal-box flex flex-col items-center gap-5 p-10 text-center">
            <h2 className="font-display text-xl font-semibold text-[#f2ece2]">
              {t("websiteGuilds.profile.notFoundTitle")}
            </h2>
            <p className="max-w-md text-sm leading-6 text-ui-muted">
              {t("websiteGuilds.profile.notFoundDescription", { name })}
            </p>
            <ButtonLink href="/guilds" variant="primary" className="portal-cta">
              {t("websiteGuilds.profile.backToGuilds")}
            </ButtonLink>
          </section>
        )}

        {data && (
          <>
            <header className="portal-box portal-box-warm overflow-hidden p-5 sm:p-6">
              <p className="font-display text-[0.6875rem] font-normal tracking-[0.24em] text-[#a8524c] uppercase">
                {t("websiteGuilds.profile.eyebrow")}
              </p>
              <h1 className="mt-2 font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
                {data.name}
              </h1>
              {data.motd && (
                <p className="mt-2 text-sm leading-6 text-ui-text italic">
                  {data.motd}
                </p>
              )}
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="font-display text-[0.6875rem] font-normal tracking-[0.18em] text-[#6e6a66] uppercase">
                    {t("websiteGuilds.profile.founded")}:
                  </dt>
                  <dd className="text-ui-text-bright">
                    {formatDate(data.createdAt)}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="font-display text-[0.6875rem] font-normal tracking-[0.18em] text-[#6e6a66] uppercase">
                    {t("websiteGuilds.profile.guildLevel")}:
                  </dt>
                  <dd className="text-ui-text-bright tabular-nums">
                    {data.level}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="font-display text-[0.6875rem] font-normal tracking-[0.18em] text-[#6e6a66] uppercase">
                    {t("websiteGuilds.members")}:
                  </dt>
                  <dd className="flex items-center gap-2 text-ui-text-bright tabular-nums">
                    {t("websiteGuilds.profile.memberCount", {
                      count: data.members.length,
                    })}
                    <span className="flex items-center gap-1.5 text-ui-muted">
                      <span
                        aria-hidden
                        className="size-2 rounded-full bg-ui-success shadow-[0_0_12px_rgba(97,119,88,0.8)]"
                      />
                      {t("websiteGuilds.profile.membersOnline", {
                        count: data.membersOnline,
                      })}
                    </span>
                  </dd>
                </div>
              </dl>
            </header>

            <section className="portal-box overflow-hidden">
              <div className="border-b border-white/5 px-[1.125rem] py-3">
                <h2 className="font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
                  {t("websiteGuilds.profile.membersTitle")}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-white/5 text-[0.6875rem] tracking-[0.16em] text-[#66625e] uppercase">
                    <tr>
                      <th className="px-5 py-3 font-medium">
                        {t("websiteGuilds.profile.name")}
                      </th>
                      <th className="px-5 py-3 font-medium">
                        {t("websiteGuilds.profile.vocation")}
                      </th>
                      <th className="px-5 py-3 text-right font-medium">
                        {t("websiteGuilds.profile.level")}
                      </th>
                      <th className="px-5 py-3 font-medium">
                        {t("websiteGuilds.profile.joined")}
                      </th>
                      <th className="px-5 py-3 font-medium">
                        {t("websiteGuilds.profile.status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.members.map((member, index) => {
                      const firstOfRank =
                        index === 0 ||
                        data.members[index - 1]?.rankLevel !== member.rankLevel;
                      return (
                        <Fragment key={member.name}>
                          {firstOfRank && (
                            <tr>
                              <th
                                scope="colgroup"
                                colSpan={5}
                                className="px-5 py-2.5 text-left font-display text-[0.6875rem] font-normal tracking-[0.2em] text-[#c9a06a] uppercase"
                              >
                                {member.rankName}
                              </th>
                            </tr>
                          )}
                          <tr className="transition-colors hover:bg-white/3">
                            <td className="px-5 py-3">
                              <Link
                                href={`/characters/${encodeURIComponent(member.name)}`}
                                className="text-[#b8b3ac] transition-colors hover:text-ui-text-bright"
                              >
                                {member.name}
                              </Link>
                              {member.nick && (
                                <span className="ml-1.5 text-ui-muted">
                                  ({member.nick})
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-ui-text">
                              {t(`vocations.${member.vocation}.name`)}
                            </td>
                            <td className="px-5 py-3 text-right text-ui-text-bright tabular-nums">
                              {member.level.toLocaleString()}
                            </td>
                            <td className="px-5 py-3 whitespace-nowrap text-ui-muted">
                              {formatDate(member.joinedAt)}
                            </td>
                            <td className="px-5 py-3">
                              <span className="flex items-center gap-2">
                                <span
                                  aria-hidden
                                  className={`size-2 shrink-0 rounded-full ${
                                    member.online
                                      ? "bg-ui-success shadow-[0_0_6px_rgba(97,119,88,0.8)]"
                                      : "bg-ui-stone-light/40"
                                  }`}
                                />
                                <span
                                  className={
                                    member.online
                                      ? "text-ui-success-light"
                                      : "text-ui-muted"
                                  }
                                >
                                  {member.online
                                    ? t("websiteGuilds.profile.online")
                                    : t("websiteGuilds.profile.offline")}
                                </span>
                              </span>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </PublicSiteLayout>
  );
}
