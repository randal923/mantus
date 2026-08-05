import { SHOP_LIMITS } from "@tibia/protocol";
import { useExhaustedAction } from "../../hooks/useExhaustedAction";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { exceedsCapacity } from "../../lib/inventory/exceedsCapacity";
import { toAuctionHistoryEntry } from "../../lib/market/toAuctionHistoryEntry";
import { toAuctionHouseItem } from "../../lib/market/toAuctionHouseItem";
import { toAuctionOffer } from "../../lib/market/toAuctionOffer";
import { toAuctionOwnOffer } from "../../lib/market/toAuctionOwnOffer";
import { precheckShopPurchase } from "../../lib/shop/precheckShopPurchase";
import { precheckShopSale } from "../../lib/shop/precheckShopSale";
import { shopMoneyAvailable } from "../../lib/shop/shopMoneyAvailable";
import { AuctionHouseModal } from "../auction/AuctionHouseModal";
import { BankPanel } from "../bank/BankPanel";
import { DepotModal } from "../depot/DepotModal";
import { DailyRewardsModal } from "../daily/DailyRewardsModal";
import { RewardChestModal } from "../reward/RewardChestModal";
import { ShopPanel } from "../shop/ShopPanel";
import { StoreModal } from "../store/StoreModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameCommerceOverlays() {
  const { t } = useAppTranslation();
  // Mirrors the server's shop exhaust so repeated Buy clicks queue rather than
  // come back as "please wait for your other action to finish".
  const runShopAction = useExhaustedAction(SHOP_LIMITS.exhaustMs);
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
  const rewardChest = useGameWindowStore((state) => state.rewardChest);
  const rewardError = useGameWindowStore((state) => state.rewardError);
  const rewardChestOpenedAtMs = useGameWindowStore(
    (state) => state.rewardChestOpenedAtMs,
  );
  const setRewardChest = useGameWindowStore((state) => state.setRewardChest);
  const dailyRewards = useGameWindowStore((state) => state.dailyRewards);
  const dailyError = useGameWindowStore((state) => state.dailyError);
  const dailyHistory = useGameWindowStore((state) => state.dailyHistory);
  const setDailyRewards = useGameWindowStore((state) => state.setDailyRewards);
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
          onOpenHome={() => {
            runtime.clientRef.current?.openStore();
          }}
          onOpenCategory={(categoryId, page) => {
            runtime.clientRef.current?.openStoreCategory(categoryId, page);
          }}
          onSelectProduct={(productId) => {
            setStoreSession((current) =>
              current
                ? { ...current, selectedProductId: productId, description: null }
                : current,
            );
            runtime.clientRef.current?.getStoreDescription(productId);
          }}
          onPurchase={(offerId, newName) => {
            const sent =
              runtime.clientRef.current?.purchaseStoreOffer(offerId, newName) ??
              false;
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
          selectedOfferId={shopSession.selectedOfferId}
          availableMoney={Math.max(
            0,
            shopMoneyAvailable({
              currencyItemTypeId: shopSession.currencyItemTypeId,
              currencyAmount: shopSession.currencyAmount,
              bankBalance: shopSession.bankBalance,
              inventory,
            }) - shopSession.pendingPurchaseCost,
          )}
          freeCapacity={Math.max(
            0,
            inventory.capacityMax * 100 - inventory.usedWeight,
          )}
          currencyName={shopSession.currencyName}
          currencySpriteId={shopSession.currencySpriteId}
          error={shopSession.error}
          lastTransaction={shopSession.lastTransaction}
          onSelect={(offerId) => {
            setShopSession((current) =>
              current?.shopSessionId === shopSession.shopSessionId
                ? { ...current, selectedOfferId: offerId, error: null }
                : current,
            );
          }}
          onBuy={(offerId, amount) =>
            runShopAction(() => {
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
                bankBalance: shopSession.bankBalance,
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
              // No optimistic placement: the client only knows the contents of
              // containers the player has open, so it cannot tell whether a
              // purchase lands in the backpack or a nested bag. Predicting it
              // used to refuse the buy outright once the main backpack filled,
              // even though the server places it in the first free slot of the
              // whole tree. The purchase is memory-first now, so the real
              // `inventory-updated` arrives in the same tick anyway.
              const sent =
                runtime.clientRef.current?.shopBuy(
                  shopSession.npcId,
                  shopSession.shopSessionId,
                  offerId,
                  amount,
                ) ?? false;
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
            })
          }
          onSell={(offerId, amount) =>
            runShopAction(() => {
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
            })
          }
          onClose={() => setShopSession(null)}
        />
      )}
      {depotSession && inventory && !marketSession && (
        <DepotModal
          key={depotSession.state.sessionId}
          state={depotSession.state}
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
          attributedItems={marketItemOffers?.ownAttributedItems.map((entry) => ({
            itemId: entry.itemId,
            tooltip: entry.tooltip,
          }))}
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
                      intent.specificItemId,
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
      {rewardChest && (
        <RewardChestModal
          state={rewardChest}
          nowMs={rewardChestOpenedAtMs}
          error={
            rewardError
              ? t(`rewardChest.errors.${rewardError}`, {
                  defaultValue: t("rewardChest.errors.invalid-request"),
                })
              : null
          }
          onCollect={(bagId, itemId) => {
            runtime.clientRef.current?.collectReward(bagId, itemId);
          }}
          onClose={() => setRewardChest(null)}
        />
      )}
      {dailyRewards && (
        <DailyRewardsModal
          state={dailyRewards}
          error={
            dailyError
              ? t(`dailyRewards.errors.${dailyError}`, {
                  defaultValue: t("dailyRewards.errors.invalid-request"),
                })
              : null
          }
          history={dailyHistory}
          onClaim={(picks) => {
            runtime.clientRef.current?.claimDailyReward(picks);
          }}
          onRefreshState={() => {
            runtime.clientRef.current?.requestDailyState();
          }}
          onRequestHistory={() => {
            runtime.clientRef.current?.requestDailyHistory();
          }}
          onClose={() => setDailyRewards(null)}
        />
      )}
    </>
  );
}
