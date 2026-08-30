"use client";

import { HOUSE_LIMITS, PREMIUM_BENEFITS } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PublicSiteLayout } from "./PublicSiteLayout";

/**
 * The benefits table renders from the same PREMIUM_BENEFITS constant the game
 * server enforces, so the page can never advertise numbers the server does
 * not apply. Rows for systems that are not implemented yet render with a
 * "coming soon" badge instead of being promised as live.
 */
const BENEFITS = [
  {
    key: "wheelCooldown",
    live: true,
    values: {
      percent: Math.round(
        (1 - PREMIUM_BENEFITS.wheelCooldownMultiplier) * 100,
      ),
    },
  },
  { key: "protectedImbuement", live: true, values: {} },
  {
    key: "expBonus",
    live: true,
    values: {
      percent: Math.round((PREMIUM_BENEFITS.experienceMultiplier - 1) * 100),
    },
  },
  {
    key: "criticalChance",
    live: true,
    values: { percent: PREMIUM_BENEFITS.criticalChancePercent },
  },
  {
    key: "exerciseSpeed",
    live: true,
    values: {
      percent: Math.round(
        (PREMIUM_BENEFITS.exerciseSpeedMultiplier - 1) * 100,
      ),
    },
  },
  {
    key: "healthRegen",
    live: true,
    values: {
      amount: PREMIUM_BENEFITS.regeneration.healthAmount,
      seconds: PREMIUM_BENEFITS.regeneration.intervalMs / 1_000,
    },
  },
  {
    key: "manaRegen",
    live: true,
    values: {
      amount: PREMIUM_BENEFITS.regeneration.manaAmount,
      seconds: PREMIUM_BENEFITS.regeneration.intervalMs / 1_000,
    },
  },
  {
    key: "proficiency",
    live: true,
    values: {
      percent: Math.round(
        (PREMIUM_BENEFITS.proficiencyExperienceMultiplier - 1) * 100,
      ),
    },
  },
  { key: "familiar", live: false, values: {} },
  { key: "fullBless", live: true, values: {} },
  { key: "loginPriority", live: true, values: {} },
  {
    key: "houseAbsence",
    live: true,
    values: {
      freeDays: HOUSE_LIMITS.absenceEvictionDays,
      premiumDays: HOUSE_LIMITS.premiumAbsenceEvictionDays,
    },
  },
] as const;

const INCLUDED_KEYS = [
  "market",
  "houses",
  "huntingTasks",
  "imbuements",
  "stamina",
  "vipList",
] as const;

export function VipAccountPage() {
  const { t } = useAppTranslation();

  return (
    <PublicSiteLayout>
      <div className="grid gap-5">
        <section className="portal-box portal-box-warm overflow-hidden p-6">
          <h1 className="font-display text-2xl font-semibold tracking-wide text-[#f2ece2]">
            {t("vipAccount.title")}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ui-text">
            {t("vipAccount.intro")}
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ui-muted">
            {t("vipAccount.howTo")}
          </p>
        </section>

        <section className="portal-box overflow-hidden">
          <h2 className="border-b border-white/5 px-[1.125rem] py-3 font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
            {t("vipAccount.tableTitle")}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[0.6875rem] tracking-[0.16em] text-[#66625e] uppercase">
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t("vipAccount.benefit")}
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    {t("vipAccount.description")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {BENEFITS.map((benefit) => (
                  <tr key={benefit.key} className="odd:bg-white/2">
                    <th
                      scope="row"
                      className="px-5 py-3 align-top font-display font-semibold whitespace-nowrap text-[#e4e1da]"
                    >
                      {t(`vipAccount.benefits.${benefit.key}.name`)}
                      {!benefit.live && (
                        <span className="ml-2 rounded-sm border border-white/10 px-1.5 py-0.5 text-[10px] font-normal tracking-wide text-ui-muted uppercase">
                          {t("vipAccount.comingSoon")}
                        </span>
                      )}
                    </th>
                    <td className="px-5 py-3 align-top text-ui-text">
                      {t(
                        `vipAccount.benefits.${benefit.key}.description`,
                        benefit.values,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="portal-box overflow-hidden">
          <h2 className="border-b border-white/5 px-[1.125rem] py-3 font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
            {t("vipAccount.includedTitle")}
          </h2>
          <ul className="divide-y divide-white/5">
            {INCLUDED_KEYS.map((key) => (
              <li
                key={key}
                className="px-5 py-3 text-sm text-ui-text"
              >
                {t(`vipAccount.included.${key}`)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PublicSiteLayout>
  );
}
