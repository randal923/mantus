"use client";

import Image from "next/image";
import { useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatCentavosBRL } from "../../lib/store/formatCentavosBRL";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { CloseButton } from "../ui/CloseButton";
import type { CoinOrderSessionState } from "../game-window/types/CoinOrderSessionState";
import { PixQrCode } from "./PixQrCode";

interface CoinOrderDialogProps {
  session: CoinOrderSessionState;
  onClose: () => void;
  onBuy: (packageId: string) => void;
  onCancelOrder: (orderId: string) => void;
}

export function CoinOrderDialog({
  session,
  onClose,
  onBuy,
  onCancelOrder,
}: CoinOrderDialogProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const [copied, setCopied] = useState(false);
  const order = session.order;
  const busy = session.pending;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-2 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("store.getCoinsTitle")}
        onClick={(event) => event.stopPropagation()}
        className="ui-panel-frame relative flex max-h-full w-full max-w-2xl flex-col overflow-y-auto p-5 font-tibia text-ui-text sm:p-8"
      >
        <header className="flex items-start gap-4">
          <h2 className="min-w-0 flex-1 font-display text-xl font-bold tracking-wide text-ui-text-bright uppercase sm:text-2xl">
            {t("store.getCoinsTitle")}
          </h2>
          <CloseButton
            label={t("modal.close")}
            onClick={onClose}
            className="size-11 rounded-full border-ui-gold/60 bg-ui-panel-deep/95 text-ui-gold"
          />
        </header>

        {session.completed && (
          <p
            role="status"
            className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-950/25 px-4 py-2.5 text-sm text-emerald-200"
          >
            {t("store.orderCompleted", {
              coins: session.completed.coins.toLocaleString(language),
            })}
          </p>
        )}
        {session.error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400/25 bg-red-950/25 px-4 py-2.5 text-sm text-red-200"
          >
            {t(`store.pixErrors.${session.error}`, {
              defaultValue: t(`store.errors.${session.error}`, {
                defaultValue: t("store.pixErrors.failed"),
              }),
            })}
          </p>
        )}

        {order === null ? (
          <>
            <p className="mt-4 text-sm leading-6 text-ui-muted">
              {t("store.getCoinsIntro")}
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {session.packages.map((pack) => (
                <li
                  key={pack.id}
                  className="flex flex-col items-center gap-3 border border-ui-gold/20 bg-black/25 p-4"
                >
                  <span className="flex items-center gap-2">
                    <Image
                      src="/assets/ui/mantus-coin.png"
                      alt=""
                      width={28}
                      height={28}
                    />
                    <span className="font-display text-lg font-bold tabular-nums text-cyan-100">
                      {pack.coins.toLocaleString(language)}
                    </span>
                  </span>
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => onBuy(pack.id)}
                    className="w-full"
                  >
                    {t("store.buyFor", {
                      price: formatCentavosBRL(pack.amountCentavos, language),
                    })}
                  </Button>
                </li>
              ))}
              {session.packages.length === 0 && (
                <li className="border border-ui-gold/15 bg-black/20 p-4 text-sm text-ui-muted sm:col-span-2">
                  {t("store.loading")}
                </li>
              )}
            </ul>
          </>
        ) : (
          <div className="mt-5 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-ui-muted">
              {t("store.packageLabel", {
                coins: order.coins.toLocaleString(language),
              })}
              {" — "}
              <span className="font-bold text-ui-text-bright">
                {formatCentavosBRL(order.amountCentavos, language)}
              </span>
            </p>
            <PixQrCode value={order.brcode} />
            <p role="status" className="text-sm text-ui-muted">
              {t("store.pixWaiting")}
            </p>
            <p className="text-xs text-ui-muted">
              {t("store.pixExpires", {
                time: new Date(order.expiresAt).toLocaleTimeString(language, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </p>
            <div className="flex w-full max-w-sm flex-col gap-2">
              <Button
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(order.brcode)
                    .then(() => setCopied(true))
                    .catch(() => {});
                }}
              >
                {copied ? t("store.pixCopied") : t("store.pixCopy")}
              </Button>
              <Button disabled={busy} onClick={() => onCancelOrder(order.id)}>
                {busy ? t("store.cancelling") : t("store.cancelOrder")}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
