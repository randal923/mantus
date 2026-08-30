"use client";

import {
  CHARACTER_VOCATIONS,
  HIGHSCORE_CATEGORIES,
  publicHighscoresDataSchema,
  type CharacterVocation,
  type HighscoreCategory,
} from "@tibia/protocol";
import Link from "next/link";
import { useState } from "react";
import { usePublicApiData } from "../../hooks/usePublicApiData";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PortalSelect } from "./PortalSelect";
import { PublicSiteLayout } from "./PublicSiteLayout";

export function HighscoresPage() {
  const { t } = useAppTranslation();
  const [category, setCategory] =
    useState<HighscoreCategory>("experience");
  const [vocation, setVocation] = useState<CharacterVocation | "all">("all");
  const [page, setPage] = useState(0);
  const search = new URLSearchParams({
    category,
    page: String(page),
  });
  if (vocation !== "all") search.set("vocation", vocation);
  const ranking = usePublicApiData(
    `/api/public/highscores?${search.toString()}`,
    publicHighscoresDataSchema,
  );

  return (
    <PublicSiteLayout>
      <div className="grid gap-5">
        <aside className="portal-box h-fit overflow-hidden p-5">
          <h2 className="font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
            {t("websiteHighscores.filters")}
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <PortalSelect<HighscoreCategory>
              ariaLabel={t("websiteHighscores.category")}
              label={t("websiteHighscores.category")}
              value={category}
              options={HIGHSCORE_CATEGORIES.map((entry) => ({
                value: entry,
                label: t(`websiteHighscores.categories.${entry}`),
              }))}
              onChange={(value) => {
                setCategory(value);
                setPage(0);
              }}
            />
            <PortalSelect<CharacterVocation | "all">
              ariaLabel={t("websiteHighscores.vocation")}
              label={t("websiteHighscores.vocation")}
              value={vocation}
              options={[
                {
                  value: "all",
                  label: t("websiteHighscores.allVocations"),
                },
                ...CHARACTER_VOCATIONS.map((entry) => ({
                  value: entry,
                  label: t(`vocations.${entry}.name`),
                })),
              ]}
              onChange={(value) => {
                setVocation(value);
                setPage(0);
              }}
            />
          </div>
          <p className="mt-5 border-t border-white/5 pt-4 text-xs leading-5 text-ui-muted">
            {t("websiteHighscores.updateNote")}
          </p>
        </aside>

        <section className="portal-box min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-[1.125rem] py-3">
            <div>
              <h2 className="font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
                {t(`websiteHighscores.categories.${category}`)}
              </h2>
              <p className="mt-1 text-xs text-ui-muted">
                {vocation === "all"
                  ? t("websiteHighscores.allVocations")
                  : t(`vocations.${vocation}.name`)}
              </p>
            </div>
            {ranking.data && (
              <p className="text-xs text-ui-muted">
                {t("websiteHighscores.page", {
                  current: ranking.data.page + 1,
                  total: ranking.data.totalPages,
                })}
              </p>
            )}
          </div>

          {ranking.status === "loading" && (
            <p className="p-8 text-center text-sm text-ui-muted">
              {t("common.loading")}…
            </p>
          )}
          {ranking.status === "unavailable" && (
            <p className="p-8 text-center text-sm text-ui-muted">
              {t("publicSite.unavailable")}
            </p>
          )}
          {ranking.data && ranking.data.entries.length === 0 && (
            <p className="p-8 text-center text-sm text-ui-muted">
              {t("websiteHighscores.empty")}
            </p>
          )}
          {ranking.data && ranking.data.entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-white/5 text-[0.6875rem] tracking-[0.16em] text-[#66625e] uppercase">
                  <tr>
                    <th className="px-5 py-3 font-medium">
                      {t("websiteHighscores.rank")}
                    </th>
                    <th className="px-5 py-3 font-medium">
                      {t("websiteHighscores.name")}
                    </th>
                    <th className="px-5 py-3 font-medium">
                      {t("websiteHighscores.vocation")}
                    </th>
                    <th className="px-5 py-3 text-right font-medium">
                      {t("websiteHighscores.level")}
                    </th>
                    {category !== "experience" && (
                      <th className="px-5 py-3 text-right font-medium">
                        {t("websiteHighscores.value")}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ranking.data.entries.map((entry) => (
                    <tr
                      key={`${entry.rank}-${entry.name}`}
                      className="transition-colors hover:bg-white/3"
                    >
                      <td className="px-5 py-3 font-display font-semibold text-[#c9a06a]">
                        {entry.rank}
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/characters/${encodeURIComponent(entry.name)}`}
                          className="text-[#b8b3ac] transition-colors hover:text-ui-text-bright"
                        >
                          {entry.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ui-text">
                        {t(`vocations.${entry.vocation}.name`)}
                      </td>
                      <td className="px-5 py-3 text-right text-ui-text">
                        {entry.level.toLocaleString()}
                      </td>
                      {category !== "experience" && (
                        <td className="px-5 py-3 text-right font-medium text-ui-text-bright">
                          {BigInt(entry.value).toLocaleString()}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ranking.data && (
            <div className="flex items-center justify-between border-t border-white/5 px-5 py-4">
              <button
                type="button"
                className="portal-btn-ghost px-5 py-2 disabled:pointer-events-none disabled:opacity-40"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                {t("websiteHighscores.previous")}
              </button>
              <span className="text-xs text-ui-muted">
                {t("websiteHighscores.page", {
                  current: ranking.data.page + 1,
                  total: ranking.data.totalPages,
                })}
              </span>
              <button
                type="button"
                className="portal-btn-ghost px-5 py-2 disabled:pointer-events-none disabled:opacity-40"
                disabled={page + 1 >= ranking.data.totalPages}
                onClick={() =>
                  setPage((current) =>
                    Math.min(ranking.data.totalPages - 1, current + 1),
                  )
                }
              >
                {t("websiteHighscores.next")}
              </button>
            </div>
          )}
        </section>
      </div>
    </PublicSiteLayout>
  );
}
