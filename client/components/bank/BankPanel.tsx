"use client";

import type { BankActionFailedReason } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Modal } from "../ui/Modal";
import { BankAmountForm } from "./BankAmountForm";
import { BankTransferForm } from "./BankTransferForm";

const GOLD_COIN_SPRITE = 7384;
const PLATINUM_COIN_SPRITE = 7409;
const CRYSTAL_COIN_SPRITE = 7435;
const PLATINUM_WORTH = 100;
const CRYSTAL_WORTH = 10_000;
const MAX_TRANSACTION_AMOUNT = 1_000_000_000_000;

interface BankPanelProps {
  npcName: string;
  balance: number;
  carriedGold: number;
  carriedPlatinum: number;
  carriedCrystal: number;
  pending: boolean;
  error: BankActionFailedReason | null;
  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number) => void;
  onTransfer: (toCharacterName: string, amount: number) => void;
  onClose: () => void;
}

export function BankPanel({
  npcName,
  balance,
  carriedGold,
  carriedPlatinum,
  carriedCrystal,
  pending,
  error,
  onDeposit,
  onWithdraw,
  onTransfer,
  onClose,
}: BankPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const carriedTotal =
    carriedGold +
    carriedPlatinum * PLATINUM_WORTH +
    carriedCrystal * CRYSTAL_WORTH;
  const maxOutgoing = Math.min(balance, MAX_TRANSACTION_AMOUNT);
  const maxDeposit = Math.min(carriedTotal, MAX_TRANSACTION_AMOUNT);

  return (
    <Modal title={t("bank.title", { npcName })} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <dl className="space-y-2 rounded-lg border border-ui-gold/15 bg-black/30 p-3 text-sm">
          <div className="flex items-center justify-between gap-3 text-ui-muted">
            <dt>{t("bank.balance")}</dt>
            <dd className="flex items-center gap-1.5 font-semibold tabular-nums text-ui-text-bright">
              {balance.toLocaleString(language)}
              <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={0.6} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 text-ui-muted">
            <dt>{t("bank.carried")}</dt>
            <dd className="flex items-center gap-3 tabular-nums text-ui-text">
              <span className="flex items-center gap-1">
                {carriedCrystal.toLocaleString(language)}
                <SpriteIcon spriteId={CRYSTAL_COIN_SPRITE} scale={0.6} />
              </span>
              <span className="flex items-center gap-1">
                {carriedPlatinum.toLocaleString(language)}
                <SpriteIcon spriteId={PLATINUM_COIN_SPRITE} scale={0.6} />
              </span>
              <span className="flex items-center gap-1">
                {carriedGold.toLocaleString(language)}
                <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={0.6} />
              </span>
            </dd>
          </div>
        </dl>

        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="border-l-2 border-red-400/60 bg-red-950/40 px-3 py-2 text-sm leading-6 text-red-200"
          >
            {t(`bank.errors.${error}`)}
          </p>
        )}

        <section aria-label={t("bank.deposit")} className="flex flex-col gap-2">
          <h3 className="font-display text-xs font-semibold tracking-[0.16em] text-ui-gold uppercase">
            {t("bank.deposit")}
          </h3>
          <BankAmountForm
            name="bank-deposit-amount"
            submitLabel={t("bank.deposit")}
            maxAmount={maxDeposit}
            disabled={pending}
            onSubmit={onDeposit}
          />
        </section>

        <section aria-label={t("bank.withdraw")} className="flex flex-col gap-2">
          <h3 className="font-display text-xs font-semibold tracking-[0.16em] text-ui-gold uppercase">
            {t("bank.withdraw")}
          </h3>
          <BankAmountForm
            name="bank-withdraw-amount"
            submitLabel={t("bank.withdraw")}
            maxAmount={maxOutgoing}
            disabled={pending}
            onSubmit={onWithdraw}
          />
        </section>

        <section aria-label={t("bank.transfer")} className="flex flex-col gap-2">
          <h3 className="font-display text-xs font-semibold tracking-[0.16em] text-ui-gold uppercase">
            {t("bank.transfer")}
          </h3>
          <BankTransferForm
            maxAmount={maxOutgoing}
            disabled={pending}
            onSubmit={onTransfer}
          />
        </section>
      </div>
    </Modal>
  );
}
