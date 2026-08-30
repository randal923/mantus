"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ButtonLink } from "../ui/ButtonLink";

/** VIP Account promo card in the landing right rail. */
export function LandingVipCard() {
  const { t } = useAppTranslation();

  return (
    <section className="portal-box portal-box-warm p-5">
      <h2 className="mb-2 font-display text-[0.9375rem] font-semibold tracking-wide text-[#f2ece2]">
        {t("landing.menu.game.vipAccount")}
      </h2>
      <p className="mb-4 text-[0.8125rem] leading-relaxed text-[#8a8681]">
        {t("landing.vip.description")}
      </p>
      <ButtonLink
        href="/vip-account"
        variant="primary"
        size="sm"
        className="portal-cta w-full justify-center"
      >
        {t("landing.vip.cta")}
      </ButtonLink>
    </section>
  );
}
