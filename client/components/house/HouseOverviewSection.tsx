"use client";

import { useState } from "react";
import type { HouseState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface HouseOverviewSectionProps {
  house: HouseState;
  pending: boolean;
  onBuy: (houseId: number) => void;
  onAbandon: () => void;
}

/**
 * Public metadata plus, for the viewer's own house, the rent state and the
 * abandon control; for an unowned house, the buy-at-entry flow. Prices and
 * eligibility shown here are display only — the server re-checks everything.
 */
export function HouseOverviewSection({
  house,
  pending,
  onBuy,
  onAbandon,
}: HouseOverviewSectionProps) {
  const { t, i18n } = useAppTranslation();
  const [confirming, setConfirming] = useState<"buy" | "abandon" | null>(null);
  const locale = i18n.language;
  const isOwner = house.myAccess === "owner";
  const rows: Array<[string, string]> = [
    [t("house.size"), t("house.sqm", { count: house.size })],
    [t("house.rent"), t("house.gold", { amount: house.rent.toLocaleString(locale) })],
    [t("house.town"), house.townName ?? String(house.townId)],
    [t("house.beds"), String(house.beds)],
    [
      t("house.owner"),
      house.ownerName ?? t("house.unowned"),
    ],
  ];
  return (
    <section className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ui-muted">{label}</dt>
            <dd className="text-ui-text-bright">{value}</dd>
          </div>
        ))}
        {isOwner && house.paidUntil !== undefined && (
          <div className="contents">
            <dt className="text-ui-muted">{t("house.paidUntil")}</dt>
            <dd className="text-ui-text-bright">
              {new Date(house.paidUntil).toLocaleDateString(locale)}
              {house.rentWarnings !== undefined && house.rentWarnings > 0 && (
                <span className="ml-2 text-red-300">
                  {t("house.warnings", { count: house.rentWarnings })}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
      {house.guildhall && (
        <p className="text-xs text-ui-gold">{t("house.guildhallNote")}</p>
      )}
      {house.ownerName === null && !house.guildhall && (
        <div className="flex items-center gap-2">
          {confirming === "buy" ? (
            <>
              <span className="text-xs text-ui-muted">
                {t("house.buyConfirm", {
                  price: house.price.toLocaleString(locale),
                })}
              </span>
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => {
                  setConfirming(null);
                  onBuy(house.houseId);
                }}
              >
                {t("house.confirm")}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                {t("house.cancel")}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => setConfirming("buy")}
            >
              {t("house.buy", { price: house.price.toLocaleString(locale) })}
            </Button>
          )}
        </div>
      )}
      {isOwner && (
        <div className="flex items-center gap-2">
          {confirming === "abandon" ? (
            <>
              <span className="text-xs text-red-300">
                {t("house.abandonConfirm")}
              </span>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => {
                  setConfirming(null);
                  onAbandon();
                }}
              >
                {t("house.confirm")}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                {t("house.cancel")}
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => setConfirming("abandon")}
            >
              {t("house.abandon")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
