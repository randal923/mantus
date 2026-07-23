"use client";

import Image from "next/image";
import { useState } from "react";
import type { StoreSessionState } from "../game-window/types/StoreSessionState";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface StoreModalProps {
  balance: number;
  premiumDaysRemaining: number;
  session: StoreSessionState | null;
  onClose: () => void;
  onPurchase: (offerId: string) => void;
}

export function StoreModal({
  balance,
  premiumDaysRemaining,
  session,
  onClose,
  onPurchase,
}: StoreModalProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const offers = session?.categories[0]?.offers ?? [];
  const featuredOffer =
    offers.find((offer) => offer.featured) ?? offers[0] ?? null;
  const selectedOffer =
    offers.find((offer) => offer.id === selectedOfferId) ?? null;

  return (
    <Modal title={t("store.title")} size="extra-wide" onClose={onClose}>
      <div className="grid min-h-[34rem] gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="flex flex-col rounded-xl border border-ui-gold/15 bg-black/25 p-3">
          <p className="px-2 pb-3 font-display text-xs tracking-[0.2em] text-ui-muted uppercase">
            {t("store.categories")}
          </p>
          <button
            type="button"
            aria-current="page"
            className="flex items-center gap-3 rounded-lg border border-cyan-300/30 bg-cyan-950/25 px-3 py-3 text-left text-ui-text-bright shadow-[inset_3px_0_0_rgba(103,232,249,0.55)]"
          >
            <span className="flex size-9 items-center justify-center rounded-lg border border-ui-gold/25 bg-black/35 text-lg text-ui-gold">
              ♛
            </span>
            <span>
              <span className="block font-display text-sm tracking-wide uppercase">
                {t("store.category.premium-time")}
              </span>
              <span className="text-xs text-ui-muted">
                {t("store.category.premium-timeHint")}
              </span>
            </span>
          </button>

          <div className="mt-auto rounded-xl border border-cyan-300/20 bg-cyan-950/15 p-3">
            <div className="flex items-center gap-3">
              <Image
                src="/assets/ui/mantus-coin.png"
                alt=""
                width={46}
                height={46}
                className="drop-shadow-[0_0_10px_rgba(77,226,223,0.4)]"
              />
              <div>
                <p className="text-xs tracking-wider text-ui-muted uppercase">
                  {t("store.yourBalance")}
                </p>
                <p className="font-display text-lg font-bold tabular-nums text-cyan-100">
                  {balance.toLocaleString(language)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-ui-muted">
              {t("store.balanceHint")}
            </p>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="relative isolate overflow-hidden rounded-xl border border-ui-accent-light/35 bg-[linear-gradient(115deg,rgba(55,10,8,0.96),rgba(8,23,25,0.92))] p-5 shadow-xl shadow-black/30 sm:p-7">
            <div
              aria-hidden
              className="absolute -top-20 -right-12 -z-10 size-72 rounded-full bg-cyan-400/10 blur-3xl"
            />
            <div
              aria-hidden
              className="absolute -bottom-28 left-1/3 -z-10 size-72 rounded-full bg-ui-accent/20 blur-3xl"
            />
            <div className="max-w-2xl">
              <p className="font-display text-xs tracking-[0.25em] text-cyan-200 uppercase">
                {t("store.hero.eyebrow")}
              </p>
              <h3 className="mt-2 font-display text-3xl leading-tight font-bold tracking-wide text-ui-text-bright uppercase sm:text-5xl">
                {t("store.hero.title")}
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-6 text-ui-text/75 sm:text-base">
                {t("store.hero.description")}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {featuredOffer && (
                  <Button
                    variant="primary"
                    onClick={() => setSelectedOfferId(featuredOffer.id)}
                  >
                    {t("store.hero.action")}
                  </Button>
                )}
                <span className="rounded-lg border border-ui-gold/20 bg-black/25 px-3 py-2 text-xs text-ui-muted">
                  {t("store.currentPremium", {
                    count: premiumDaysRemaining,
                  })}
                </span>
              </div>
            </div>
          </section>

          {!session ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-ui-gold/15 bg-black/20 text-ui-muted">
              {t("store.loading")}
            </div>
          ) : (
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="font-display text-lg tracking-wide text-ui-text-bright uppercase">
                    {t("store.premiumOffers")}
                  </p>
                  <p className="text-xs text-ui-muted">
                    {t("store.premiumOffersHint")}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {offers.map((offer) => (
                  <article
                    key={offer.id}
                    className={`relative rounded-xl border bg-black/25 p-4 transition-[border-color,transform] hover:-translate-y-0.5 ${
                      offer.featured
                        ? "border-cyan-300/45"
                        : "border-ui-gold/15"
                    }`}
                  >
                    {offer.featured && (
                      <span className="absolute top-0 right-3 -translate-y-1/2 rounded-full border border-cyan-200/35 bg-cyan-950 px-2 py-0.5 text-[10px] tracking-wider text-cyan-100 uppercase">
                        {t("store.popular")}
                      </span>
                    )}
                    <p className="font-display text-2xl font-bold text-ui-text-bright">
                      {t("store.days", { count: offer.premiumDays })}
                    </p>
                    <p className="mt-1 text-xs text-ui-muted">
                      {t("store.premiumAccount")}
                    </p>
                    <div className="my-4 h-px bg-linear-to-r from-transparent via-ui-gold/25 to-transparent" />
                    <div className="flex items-center gap-2">
                      <Image
                        src="/assets/ui/mantus-coin.png"
                        alt=""
                        width={28}
                        height={28}
                      />
                      <span className="font-display text-lg font-bold tabular-nums text-cyan-100">
                        {offer.price.toLocaleString(language)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="mt-4 w-full"
                      disabled={session.pending}
                      onClick={() => setSelectedOfferId(offer.id)}
                    >
                      {t("store.select")}
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {session?.purchasedOfferId && (
            <p
              role="status"
              className="rounded-lg border border-emerald-400/25 bg-emerald-950/25 px-4 py-3 text-emerald-200"
            >
              {t("store.purchaseComplete")}
            </p>
          )}
          {session?.error && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/25 bg-red-950/25 px-4 py-3 text-red-200"
            >
              {t(`store.errors.${session.error}`, {
                defaultValue: t("store.errors.failed"),
              })}
            </p>
          )}
        </div>
      </div>

      {selectedOffer && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-cyan-300/25 bg-cyan-950/15 p-4">
          <Image
            src="/assets/ui/mantus-coin.png"
            alt=""
            width={44}
            height={44}
          />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base text-ui-text-bright uppercase">
              {t("store.confirmTitle", {
                count: selectedOffer.premiumDays,
              })}
            </p>
            <p className="text-xs text-ui-muted">
              {t("store.confirmDescription", {
                price: selectedOffer.price.toLocaleString(language),
              })}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setSelectedOfferId(null)}
            disabled={session?.pending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={session?.pending || balance < selectedOffer.price}
            onClick={() => onPurchase(selectedOffer.id)}
          >
            {session?.pending &&
            session.pendingOfferId === selectedOffer.id
              ? t("store.purchasing")
              : t("store.confirm")}
          </Button>
        </div>
      )}
    </Modal>
  );
}
