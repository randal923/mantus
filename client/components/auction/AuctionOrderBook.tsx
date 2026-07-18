import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import type {
  AuctionHouseItem,
  AuctionOffer,
  AuctionOfferAcceptanceIntent,
} from "./auctionTypes";

const GOLD_COIN_SPRITE = 7384;

interface AuctionOrderBookProps {
  item?: AuctionHouseItem;
  offers: ReadonlyArray<AuctionOffer>;
  goldBalance: number;
  onAcceptOffer?: (intent: AuctionOfferAcceptanceIntent) => void;
}

export function AuctionOrderBook({
  item,
  offers,
  goldBalance,
  onAcceptOffer,
}: AuctionOrderBookProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const sellOffers = offers
    .filter((offer) => offer.side === "sell" && offer.itemId === item?.id)
    .sort((left, right) => left.pricePerItem - right.pricePerItem);
  const buyOffers = offers
    .filter((offer) => offer.side === "buy" && offer.itemId === item?.id)
    .sort((left, right) => right.pricePerItem - left.pricePerItem);

  return (
    <section
      aria-label={t("auction.orderBook")}
      className="flex h-full min-h-[36rem] flex-col overflow-hidden rounded-xl border border-ui-stone-light/15 bg-black/20 shadow-inner shadow-black/40 lg:min-h-0"
    >
      {!item ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-ui-muted">
          {t("auction.selectItem")}
        </div>
      ) : (
        <>
          <header className="relative isolate flex items-center gap-4 overflow-hidden border-b border-ui-gold/15 p-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-64 bg-linear-to-r from-ui-accent/15 to-transparent"
            />
            <span className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-ui-gold/25 bg-black/45 shadow-inner shadow-black/60">
              <SpriteIcon spriteId={item.spriteId} scale={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-semibold tracking-[0.18em] text-ui-gold uppercase">
                {t(`auction.categories.${item.category}`)}
              </span>
              <h2 className="truncate font-display text-xl tracking-wide text-ui-text-bright">
                {item.name}
              </h2>
              <p className="mt-1 text-xs text-ui-muted">
                {t("auction.owned", { count: item.ownedCount })}
              </p>
            </div>
            <div className="hidden shrink-0 rounded-lg border border-ui-gold/15 bg-black/30 px-3 py-2 text-right sm:block">
              <span className="block text-[9px] tracking-[0.14em] text-ui-muted uppercase">
                {t("auction.averagePrice")}
              </span>
              <span className="mt-0.5 flex items-center justify-end gap-1.5 font-display text-base tabular-nums text-ui-text-bright">
                {item.averagePrice.toLocaleString(language)}
                <SpriteIcon spriteId={GOLD_COIN_SPRITE} scale={0.65} />
              </span>
            </div>
          </header>

          <div className="ui-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            <section
              aria-labelledby="auction-sell-offers-heading"
              className="overflow-hidden rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/45"
            >
              <header className="flex items-center justify-between gap-3 border-b border-ui-stone-light/15 bg-white/3 px-3 py-2.5">
                <div>
                  <h3
                    id="auction-sell-offers-heading"
                    className="font-display text-xs font-semibold tracking-[0.14em] text-ui-text-bright uppercase"
                  >
                    {t("auction.sellOffers")}
                  </h3>
                  <p className="mt-0.5 text-[10px] text-ui-muted">
                    {t("auction.sellOffersHint")}
                  </p>
                </div>
                <span className="rounded-full border border-ui-stone-light/15 bg-black/30 px-2 py-0.5 text-[10px] tabular-nums text-ui-muted">
                  {sellOffers.length}
                </span>
              </header>

              {sellOffers.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-ui-muted">
                  {t("auction.noSellOffers")}
                </p>
              ) : (
                <div className="ui-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
                    <caption className="sr-only">
                      {t("auction.sellOffersFor", { item: item.name })}
                    </caption>
                    <thead className="bg-black/25 text-[9px] tracking-wider text-ui-muted uppercase">
                      <tr>
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
                      {sellOffers.map((offer) => {
                        const total = offer.amount * offer.pricePerItem;

                        return (
                          <tr
                            key={offer.id}
                            className="border-t border-ui-stone-light/10 transition-colors hover:bg-white/3"
                          >
                            <td className="px-3 py-2.5 font-semibold tabular-nums text-ui-text-bright">
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
                              <span className="flex items-center justify-end gap-2">
                                {offer.mine && (
                                  <span className="rounded-full border border-ui-gold/25 bg-black/30 px-2 py-0.5 text-[9px] tracking-wider text-ui-gold uppercase">
                                    {t("auction.yours")}
                                  </span>
                                )}
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={
                                    !onAcceptOffer ||
                                    offer.mine === true ||
                                    goldBalance < total
                                  }
                                  aria-label={t("auction.buyOfferAction", {
                                    count: offer.amount,
                                    item: item.name,
                                    total: total.toLocaleString(language),
                                  })}
                                  onClick={() =>
                                    onAcceptOffer?.({
                                      offerId: offer.id,
                                      amount: offer.amount,
                                    })
                                  }
                                >
                                  {t("auction.buy")}
                                </Button>
                              </span>
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
              aria-labelledby="auction-buy-offers-heading"
              className="overflow-hidden rounded-lg border border-ui-stone-light/15 bg-ui-panel-deep/45"
            >
              <header className="flex items-center justify-between gap-3 border-b border-ui-stone-light/15 bg-white/3 px-3 py-2.5">
                <div>
                  <h3
                    id="auction-buy-offers-heading"
                    className="font-display text-xs font-semibold tracking-[0.14em] text-ui-text-bright uppercase"
                  >
                    {t("auction.buyOffers")}
                  </h3>
                  <p className="mt-0.5 text-[10px] text-ui-muted">
                    {t("auction.buyOffersHint")}
                  </p>
                </div>
                <span className="rounded-full border border-ui-stone-light/15 bg-black/30 px-2 py-0.5 text-[10px] tabular-nums text-ui-muted">
                  {buyOffers.length}
                </span>
              </header>

              {buyOffers.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-ui-muted">
                  {t("auction.noBuyOffers")}
                </p>
              ) : (
                <div className="ui-scrollbar overflow-x-auto">
                  <table className="w-full min-w-[36rem] border-collapse text-left text-xs">
                    <caption className="sr-only">
                      {t("auction.buyOffersFor", { item: item.name })}
                    </caption>
                    <thead className="bg-black/25 text-[9px] tracking-wider text-ui-muted uppercase">
                      <tr>
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
                      {buyOffers.map((offer) => {
                        const total = offer.amount * offer.pricePerItem;

                        return (
                          <tr
                            key={offer.id}
                            className="border-t border-ui-stone-light/10 transition-colors hover:bg-white/3"
                          >
                            <td className="px-3 py-2.5 font-semibold tabular-nums text-ui-text-bright">
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
                              <span className="flex items-center justify-end gap-2">
                                {offer.mine && (
                                  <span className="rounded-full border border-ui-gold/25 bg-black/30 px-2 py-0.5 text-[9px] tracking-wider text-ui-gold uppercase">
                                    {t("auction.yours")}
                                  </span>
                                )}
                                <Button
                                  size="sm"
                                  disabled={
                                    !onAcceptOffer ||
                                    offer.mine === true ||
                                    item.ownedCount < offer.amount
                                  }
                                  aria-label={t("auction.sellOfferAction", {
                                    count: offer.amount,
                                    item: item.name,
                                    total: total.toLocaleString(language),
                                  })}
                                  onClick={() =>
                                    onAcceptOffer?.({
                                      offerId: offer.id,
                                      amount: offer.amount,
                                    })
                                  }
                                >
                                  {t("auction.sell")}
                                </Button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
