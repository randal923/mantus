import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import type { AuctionHistoryEntry, AuctionOwnOffer } from "./auctionTypes";

interface AuctionMyOffersProps {
  ownOffers: ReadonlyArray<AuctionOwnOffer>;
  history: ReadonlyArray<AuctionHistoryEntry>;
  onCancelOffer?: (offerId: string) => void;
}

export function AuctionMyOffers({
  ownOffers,
  history,
  onCancelOffer,
}: AuctionMyOffersProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);

  return (
    <section
      aria-label={t("auction.myOffersTab")}
      className="flex h-full min-h-[36rem] flex-col overflow-hidden rounded-xl border border-ui-stone-light/15 bg-black/20 shadow-inner shadow-black/40 lg:min-h-0"
    >
      <div className="ui-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section
          aria-labelledby="auction-own-offers-heading"
          className="overflow-hidden rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/45"
        >
          <header className="flex items-center justify-between gap-3 border-b border-ui-stone-light/15 bg-white/3 px-3 py-2.5">
            <h3
              id="auction-own-offers-heading"
              className="font-display text-sm font-semibold tracking-[0.14em] text-ui-text-bright uppercase"
            >
              {t("auction.activeOffers")}
            </h3>
            <span className="rounded-full border border-ui-stone-light/15 bg-black/30 px-2 py-0.5 text-xs tabular-nums text-ui-muted">
              {ownOffers.length}
            </span>
          </header>

          {ownOffers.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ui-muted">
              {t("auction.noOwnOffers")}
            </p>
          ) : (
            <div className="ui-scrollbar overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                <caption className="sr-only">{t("auction.activeOffers")}</caption>
                <thead className="bg-black/25 text-xs tracking-wider text-ui-muted uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.item")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.offerType")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.amount")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.piecePrice")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.totalPrice")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.endsAt")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      <span className="sr-only">{t("auction.action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ownOffers.map((offer) => {
                    const total = offer.amount * offer.pricePerItem;

                    return (
                      <tr
                        key={offer.id}
                        className="border-t border-ui-stone-light/10 transition-colors hover:bg-white/3"
                      >
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <SpriteIcon spriteId={offer.spriteId} scale={0.9} />
                            <span className="max-w-40 truncate font-semibold text-ui-text-bright">
                              {offer.name}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-ui-text uppercase">
                          {t(`auction.${offer.side}`)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-ui-text-bright">
                          {offer.amount.toLocaleString(language)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-ui-text">
                          {offer.pricePerItem.toLocaleString(language)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-ui-gold">
                          {total.toLocaleString(language)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-ui-muted">
                          {new Date(offer.expiresAt).toLocaleDateString(
                            language,
                            { month: "short", day: "numeric" },
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            disabled={!onCancelOffer}
                            aria-label={t("auction.cancelOfferAction", {
                              item: offer.name,
                            })}
                            onClick={() => onCancelOffer?.(offer.id)}
                          >
                            {t("auction.cancel")}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="auction-history-heading"
          className="overflow-hidden rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/45"
        >
          <header className="flex items-center justify-between gap-3 border-b border-ui-stone-light/15 bg-white/3 px-3 py-2.5">
            <h3
              id="auction-history-heading"
              className="font-display text-sm font-semibold tracking-[0.14em] text-ui-text-bright uppercase"
            >
              {t("auction.history")}
            </h3>
            <span className="rounded-full border border-ui-stone-light/15 bg-black/30 px-2 py-0.5 text-xs tabular-nums text-ui-muted">
              {history.length}
            </span>
          </header>

          {history.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ui-muted">
              {t("auction.noHistory")}
            </p>
          ) : (
            <div className="ui-scrollbar overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                <caption className="sr-only">{t("auction.history")}</caption>
                <thead className="bg-black/25 text-xs tracking-wider text-ui-muted uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.item")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.offerType")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.amount")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.piecePrice")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.status")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("auction.date")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry, index) => (
                    <tr
                      key={`${entry.occurredAt}:${entry.itemId}:${index}`}
                      className="border-t border-ui-stone-light/10 transition-colors hover:bg-white/3"
                    >
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <SpriteIcon spriteId={entry.spriteId} scale={0.9} />
                          <span className="max-w-40 truncate font-semibold text-ui-text-bright">
                            {entry.name}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ui-text uppercase">
                        {t(`auction.${entry.side}`)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ui-text-bright">
                        {entry.amount.toLocaleString(language)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ui-text">
                        {entry.pricePerItem.toLocaleString(language)}
                      </td>
                      <td className="px-3 py-2.5 text-ui-muted uppercase">
                        {t(`auction.states.${entry.state}`)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ui-muted">
                        {new Date(entry.occurredAt).toLocaleDateString(
                          language,
                          { month: "short", day: "numeric" },
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
