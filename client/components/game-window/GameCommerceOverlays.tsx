import { GOLD_COIN_TYPE_ID } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { exceedsCapacity } from "../../lib/inventory/exceedsCapacity";
import { toInventoryItemPresentation } from "../../lib/inventory/toInventoryItemPresentation";
import { toAuctionHistoryEntry } from "../../lib/market/toAuctionHistoryEntry";
import { toAuctionHouseItem } from "../../lib/market/toAuctionHouseItem";
import { toAuctionOffer } from "../../lib/market/toAuctionOffer";
import { toAuctionOwnOffer } from "../../lib/market/toAuctionOwnOffer";
import { precheckShopPurchase } from "../../lib/shop/precheckShopPurchase";
import { precheckShopSale } from "../../lib/shop/precheckShopSale";
import { AuctionHouseModal } from "../auction/AuctionHouseModal";
import { BankPanel } from "../bank/BankPanel";
import { DepotModal } from "../depot/DepotModal";
import { ShopPanel } from "../shop/ShopPanel";
import { StoreModal } from "../store/StoreModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameCommerceOverlays() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const bankSession = useGameWindowStore((state) => state.bankSession);
  const shopSession = useGameWindowStore((state) => state.shopSession);
  const storeOpen = useGameWindowStore((state) => state.storeOpen);
  const storeSession = useGameWindowStore((state) => state.storeSession);
  const mantusCoins = useGameWindowStore((state) => state.mantusCoins);
  const premiumDaysRemaining = useGameWindowStore(
    (state) => state.premiumDaysRemaining,
  );
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
  );
  const depotSession = useGameWindowStore(
    (state) => state.sessions?.depot ?? null,
  );
  const marketSession = useGameWindowStore(
    (state) => state.sessions?.market ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const marketSelectedItem = useGameWindowStore(
    (state) => state.marketSelectedItem,
  );
  const setBankSession = useGameWindowStore((state) => state.setBankSession);
  const setShopSession = useGameWindowStore((state) => state.setShopSession);
  const setStoreOpen = useGameWindowStore((state) => state.setStoreOpen);
  const setStoreSession = useGameWindowStore((state) => state.setStoreSession);
  const setMarketSelectedItem = useGameWindowStore(
    (state) => state.setMarketSelectedItem,
  );
  const closeMarket = useGameWindowStore((state) => state.closeMarket);
  const marketItemOffers = marketSession?.itemOffers ?? null;
  if (!sessionActions) return null;

  return (
    <>
      {storeOpen && (
        <StoreModal
          balance={mantusCoins}
          premiumDaysRemaining={premiumDaysRemaining}
          session={storeSession}
          onClose={() => setStoreOpen(false)}
          onPurchase={(offerId) => {
            const sent =
              runtime.clientRef.current?.purchaseStoreOffer(offerId) ?? false;
            setStoreSession((current) =>
              current
                ? {
                    ...current,
                    pending: sent,
                    pendingOfferId: sent ? offerId : null,
                    purchasedOfferId: null,
                    error: sent ? null : "failed",
                  }
                : current,
            );
          }}
        />
      )}
      {bankSession && inventory && (
        <BankPanel
          npcName={bankSession.npcName}
          balance={bankSession.balance}
          carriedGold={inventory.gold}
          carriedPlatinum={inventory.platinum}
          carriedCrystal={inventory.crystal}
          pending={bankSession.pending}
          error={bankSession.error}
          onDeposit={(amount) => {
            setBankSession((current) =>
              current ? { ...current, pending: true, error: null } : current,
            );
            runtime.clientRef.current?.bankDeposit(bankSession.npcId, amount);
          }}
          onWithdraw={(amount) => {
            setBankSession((current) =>
              current ? { ...current, pending: true, error: null } : current,
            );
            runtime.clientRef.current?.bankWithdraw(bankSession.npcId, amount);
          }}
          onTransfer={(toCharacterName, amount) => {
            setBankSession((current) =>
              current ? { ...current, pending: true, error: null } : current,
            );
            runtime.clientRef.current?.bankTransfer(
              bankSession.npcId,
              toCharacterName,
              amount,
            );
          }}
          onClose={() => setBankSession(null)}
        />
      )}
      {shopSession && inventory && (
        <ShopPanel
          npcName={shopSession.npcName}
          entries={shopSession.entries}
          carriedTotal={Math.max(
            0,
            (shopSession.currencyItemTypeId === GOLD_COIN_TYPE_ID
              ? inventory.gold +
                inventory.platinum * 100 +
                inventory.crystal * 10_000
              : shopSession.currencyAmount) - shopSession.pendingPurchaseCost,
          )}
          currencyName={shopSession.currencyName}
          currencySpriteId={shopSession.currencySpriteId}
          pending={shopSession.pending}
          error={shopSession.error}
          lastTransaction={shopSession.lastTransaction}
          onBuy={(offerId, amount) => {
            const entry = shopSession.entries.find(
              (candidate) => candidate.offerId === offerId,
            );
            if (!entry || entry.buyPrice === undefined) return;
            const rejection = precheckShopPurchase({
              unitWeight: entry.weight,
              amount,
              totalCost: entry.buyPrice * amount,
              currencyItemTypeId: shopSession.currencyItemTypeId,
              currencyAmount: shopSession.currencyAmount,
              currencyWeight: shopSession.currencyWeight,
              coinWeights: shopSession.coinWeights,
              pendingPurchaseCost: shopSession.pendingPurchaseCost,
              inventory,
            });
            if (rejection) {
              setShopSession((current) =>
                current?.shopSessionId === shopSession.shopSessionId
                  ? { ...current, error: rejection }
                  : current,
              );
              return;
            }
            const predicted = sessionActions.inventory.preview({
              kind: "add",
              item: toInventoryItemPresentation(entry),
              count: amount,
              itemIds: Array.from(
                {
                  length: entry.stackable
                    ? Math.ceil(amount / entry.maxCount)
                    : amount,
                },
                () => crypto.randomUUID(),
              ),
            });
            if (!predicted) {
              setShopSession((current) =>
                current?.shopSessionId === shopSession.shopSessionId
                  ? { ...current, error: "busy" }
                  : current,
              );
              return;
            }
            const sent =
              runtime.clientRef.current?.shopBuy(
                shopSession.npcId,
                shopSession.shopSessionId,
                offerId,
                amount,
              ) ?? false;
            if (!sent) sessionActions.inventory.rejectPreview();
            setShopSession((current) =>
              current?.shopSessionId === shopSession.shopSessionId
                ? {
                    ...current,
                    pending: sent,
                    error: sent ? null : "failed",
                    pendingPurchaseCost: sent ? entry.buyPrice! * amount : 0,
                  }
                : current,
            );
          }}
          onSell={(offerId, amount) => {
            const entry = shopSession.entries.find(
              (candidate) => candidate.offerId === offerId,
            );
            if (!entry || entry.sellPrice === undefined) return;
            const rejection = precheckShopSale({
              unitWeight: entry.weight,
              amount,
              totalProceeds: entry.sellPrice * amount,
              currencyItemTypeId: shopSession.currencyItemTypeId,
              currencyWeight: shopSession.currencyWeight,
              coinWeights: shopSession.coinWeights,
              inventory,
            });
            if (rejection) {
              setShopSession((current) =>
                current?.shopSessionId === shopSession.shopSessionId
                  ? { ...current, error: rejection }
                  : current,
              );
              return;
            }
            const sent =
              runtime.clientRef.current?.shopSell(
                shopSession.npcId,
                shopSession.shopSessionId,
                offerId,
                amount,
              ) ?? false;
            if (!sent) return;
            setShopSession((current) =>
              current?.shopSessionId === shopSession.shopSessionId
                ? { ...current, pending: true, error: null }
                : current,
            );
          }}
          onClose={() => setShopSession(null)}
        />
      )}
      {depotSession && inventory && !marketSession && (
        <DepotModal
          key={depotSession.state.sessionId}
          state={depotSession.state}
          inventoryItems={inventory.items}
          pending={depotSession.pending}
          error={depotSession.error}
          onBrowse={(location, page, query) => {
            const sent =
              runtime.clientRef.current?.browseDepot(
                depotSession.state,
                location,
                page,
                query,
              ) ?? false;
            sessionActions.depot.beginBrowse(sent);
          }}
          onDeposit={(item) => {
            if (
              depotSession.state.depotCount >=
              depotSession.state.depotCapacity
            ) {
              sessionActions.depot.reject("depot-full");
              return;
            }
            sessionActions.depot.enqueue({ kind: "deposit", item });
          }}
          onWithdraw={(entry) => {
            if (exceedsCapacity(inventory, entry.weight * entry.count)) {
              sessionActions.depot.reject("no-capacity");
              return;
            }
            sessionActions.depot.enqueue({ kind: "withdraw", entry });
          }}
          onStashDeposit={(item, count) => {
            sessionActions.depot.enqueue({
              kind: "stash-deposit",
              item,
              count,
            });
          }}
          onStashWithdraw={(entry, count) => {
            if (exceedsCapacity(inventory, entry.weight * count)) {
              sessionActions.depot.reject("no-capacity");
              return;
            }
            sessionActions.depot.enqueue({
              kind: "stash-withdraw",
              entry,
              count,
            });
          }}
          onClose={() => {
            runtime.clientRef.current?.closeDepot(
              depotSession.state.sessionId,
            );
            sessionActions.depot.close();
          }}
        />
      )}
      {marketSession && (
        <AuctionHouseModal
          items={marketSession.items.map(toAuctionHouseItem)}
          offers={
            marketItemOffers
              ? marketItemOffers.offers.map((offer) =>
                  toAuctionOffer(offer, marketItemOffers.itemTypeId),
                )
              : []
          }
          goldBalance={marketSession.balance}
          selectedItemId={marketSelectedItem}
          ownOffers={marketSession.ownOffers.map(toAuctionOwnOffer)}
          history={marketSession.history.map(toAuctionHistoryEntry)}
          error={
            marketSession.error
              ? t(`auction.errors.${marketSession.error}`, {
                  defaultValue: t("auction.errors.failed"),
                })
              : null
          }
          onClose={closeMarket}
          onSelectItem={(itemId) => {
            const itemTypeId = Number(itemId);
            if (!Number.isInteger(itemTypeId)) return;
            runtime.marketSelectedItemRef.current = itemTypeId;
            setMarketSelectedItem(itemId);
            runtime.clientRef.current?.browseMarket(itemTypeId);
          }}
          onAcceptOffer={
            marketSession.pending
              ? undefined
              : (intent) => {
                  const sent =
                    runtime.clientRef.current?.acceptMarketOffer(
                      crypto.randomUUID(),
                      intent.offerId,
                      intent.amount,
                    ) ?? false;
                  sessionActions.market.begin(sent);
                }
          }
          onCreateOrder={
            marketSession.pending
              ? undefined
              : (intent) => {
                  const itemTypeId = Number(intent.itemId);
                  if (!Number.isInteger(itemTypeId)) return;
                  const sent =
                    runtime.clientRef.current?.createMarketOffer(
                      crypto.randomUUID(),
                      intent.side,
                      itemTypeId,
                      intent.amount,
                      intent.pricePerItem,
                    ) ?? false;
                  sessionActions.market.begin(sent);
                }
          }
          onCancelOffer={
            marketSession.pending
              ? undefined
              : (offerId) => {
                  const sent =
                    runtime.clientRef.current?.cancelMarketOffer(
                      crypto.randomUUID(),
                      offerId,
                    ) ?? false;
                  sessionActions.market.begin(sent);
                }
          }
        />
      )}
    </>
  );
}
