"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { TradeSessionState } from "../../hooks/useTradeSession";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { TradeOfferGrid } from "./TradeOfferGrid";

interface TradePanelProps {
  session: TradeSessionState;
  error: string | null;
  onAccept: () => void;
  onCancel: () => void;
}

/**
 * The trade window: both offers side by side with accept state. Accepting is
 * possible only once both sides have put an item on the table; the server
 * re-validates everything and the swap commits when both have accepted.
 */
export function TradePanel({
  session,
  error,
  onAccept,
  onCancel,
}: TradePanelProps) {
  const { t } = useAppTranslation();
  const bothOffered = session.ownOffer !== null && session.partnerOffer !== null;
  const canAccept = bothOffered && !session.ownAccepted && !session.pending;
  return (
    <Modal
      title={t("trade.title", { name: session.partnerName })}
      onClose={onCancel}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <p aria-live="polite" className="min-w-0 flex-1 text-xs text-ui-text/80">
            {error ??
              (session.ownAccepted
                ? t("trade.waitingForPartnerAccept", {
                    name: session.partnerName,
                  })
                : bothOffered
                  ? t("trade.readyHint")
                  : t("trade.counterOfferHint"))}
          </p>
          <Button onClick={onCancel}>{t("trade.cancel")}</Button>
          <Button variant="primary" disabled={!canAccept} onClick={onAccept}>
            {t("trade.accept")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-6">
        <TradeOfferGrid
          label={t("trade.ownOffer")}
          offer={session.ownOffer}
          accepted={session.ownAccepted}
        />
        <TradeOfferGrid
          label={t("trade.partnerOffer", { name: session.partnerName })}
          offer={session.partnerOffer}
          accepted={session.partnerAccepted}
        />
      </div>
    </Modal>
  );
}
