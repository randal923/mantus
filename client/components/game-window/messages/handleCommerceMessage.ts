import { GOLD_COIN_TYPE_ID } from "@tibia/protocol";
import type { ServerMessage } from "@tibia/protocol";
import { i18n } from "../../../i18n/i18n";
import type { GameWindowMessageContext } from "../types/GameWindowMessageContext";

export function handleCommerceMessage(
  message: ServerMessage,
  { client, store }: GameWindowMessageContext,
): boolean {
  const state = store.getState();
  const actions = state.sessionActions;
  if (!actions) return false;

  const { runtime } = state;

  if (message.type === "store-state") {
    state.setMantusCoins(message.balance);
    state.setStoreSession({
      categories: message.categories,
      home: message.home,
      categoryId: null,
      products: [],
      page: 0,
      pageCount: 1,
      selectedProductId: message.home[0]?.id ?? null,
      description: null,
      pending: false,
      pendingOfferId: null,
      purchasedOfferId: null,
      purchaseDeliveredToBound: false,
      error: null,
    });
    return true;
  }

  if (message.type === "store-offers") {
    state.setStoreSession((current) =>
      current
        ? {
            ...current,
            categoryId: message.categoryId,
            products: message.products,
            page: message.page,
            pageCount: message.pageCount,
            // Selecting the first product mirrors the official store, which
            // focuses a row as soon as a category opens.
            selectedProductId: message.products[0]?.id ?? null,
            description: null,
            error: null,
          }
        : current,
    );
    return true;
  }

  if (message.type === "store-description-state") {
    state.setStoreSession((current) =>
      current && current.selectedProductId === message.productId
        ? { ...current, description: message.description }
        : current,
    );
    return true;
  }

  if (message.type === "store-purchase-completed") {
    state.setMantusCoins(message.balance);
    state.setAccountTier(message.accountTier);
    state.setPremiumDaysRemaining(message.premiumDaysRemaining);
    state.setStoreSession((current) =>
      current
        ? {
            ...current,
            pending: false,
            pendingOfferId: null,
            purchasedOfferId: message.offerId,
            purchaseDeliveredToBound: message.deliveredToBound === true,
            error: null,
          }
        : current,
    );
    return true;
  }

  if (message.type === "store-action-failed") {
    state.setStoreSession((current) =>
      current
        ? {
            ...current,
            pending: false,
            pendingOfferId: null,
            error: message.reason,
          }
        : current,
    );
    return true;
  }

  if (message.type === "bank-opened") {
    state.setBankBalance(message.balance);
    state.setShopSession(null);
    actions.depot.reset();
    state.closeMarket();
    state.setMailboxSession(null);
    state.setBankSession({
      npcId: message.npcId,
      npcName: message.npcName,
      balance: message.balance,
      pending: false,
      error: null,
    });
    return true;
  }

  if (message.type === "bank-updated") {
    state.setBankBalance(message.balance);
    state.setBankSession((current) =>
      current
        ? {
            ...current,
            balance: message.balance,
            pending: false,
            error: null,
          }
        : current,
    );
    // An open shop spends bank money for whatever the carried coins cannot
    // cover, so its amount slider follows the same balance.
    state.setShopSession((current) =>
      current ? { ...current, bankBalance: message.balance } : current,
    );
    return true;
  }

  if (message.type === "bank-action-failed") {
    state.setBankSession((current) => {
      if (!current) return current;
      if (message.reason === "out-of-range") return null;
      return { ...current, pending: false, error: message.reason };
    });
    return true;
  }

  if (message.type === "portable-seller-cooldown") {
    state.showScreenMessage(
      i18n.t("inventory.portableSellerCooldown", {
        seconds: Math.ceil(message.remainingMs / 1_000),
      }),
      "status",
    );
    return true;
  }

  if (message.type === "portable-seller-triggered") {
    state.setBankBalance(message.bankBalance);
    state.setShopSession((current) =>
      current ? { ...current, bankBalance: message.bankBalance } : current,
    );
    state.setPortableSellerNotice({
      id: message.saleId,
      itemId: message.itemId,
    });
    state.appendCombatLog(
      i18n.t("inventory.portableSellerSold", {
        soldCount: message.soldCount,
        gold: message.proceeds,
      }),
    );
    return true;
  }

  if (message.type === "shop-opened") {
    state.setBankBalance(message.bankBalance);
    state.setBankSession(null);
    actions.depot.reset();
    state.closeMarket();
    state.setMailboxSession(null);
    state.setShopSession((current) => {
      if (message.page === 1) {
        return {
          npcId: message.npcId,
          npcName: message.npcName,
          shopSessionId: message.shopSessionId,
          currencyItemTypeId: message.currencyItemTypeId,
          currencySpriteId: message.currencySpriteId,
          currencyName: message.currencyName,
          currencyAmount: message.currencyAmount,
          currencyWeight: message.currencyWeight,
          bankBalance: message.bankBalance,
          coinWeights: message.coinWeights,
          pageCount: message.pageCount,
          nextPage: 2,
          entries: message.entries,
          selectedOfferId: message.entries[0]?.offerId ?? null,
          pending: false,
          error: null,
          lastTransaction: null,
          pendingPurchaseCost: 0,
        };
      }
      if (
        !current ||
        current.shopSessionId !== message.shopSessionId ||
        current.pageCount !== message.pageCount ||
        current.nextPage !== message.page ||
        current.currencyItemTypeId !== message.currencyItemTypeId
      ) {
        return current;
      }
      return {
        ...current,
        entries: [...current.entries, ...message.entries],
        selectedOfferId:
          current.selectedOfferId ?? message.entries[0]?.offerId ?? null,
        nextPage: current.nextPage + 1,
      };
    });
    return true;
  }

  if (message.type === "shop-transacted") {
    state.setShopSession((current) =>
      current
        ? {
            ...current,
            pending: false,
            error: null,
            lastTransaction: message,
            pendingPurchaseCost: 0,
            // The traded offer's sellable count moved by exactly this amount.
            // Other offers keep their opening count; the server is still the
            // authority and refuses a sale the player cannot cover.
            entries: current.entries.map((entry) =>
              entry.offerId === message.offerId
                ? {
                    ...entry,
                    owned: Math.max(
                      0,
                      entry.owned +
                        (message.kind === "sale"
                          ? -message.amount
                          : message.amount),
                    ),
                  }
                : entry,
            ),
            currencyAmount:
              current.currencyItemTypeId === GOLD_COIN_TYPE_ID
                ? current.currencyAmount
                : Math.max(
                    0,
                    current.currencyAmount +
                      (message.kind === "sale"
                        ? message.totalPrice
                        : -message.totalPrice),
                  ),
          }
        : current,
    );
    return true;
  }

  if (message.type === "shop-action-failed") {
    state.setShopSession((current) => {
      if (!current) return current;
      if (
        message.reason === "out-of-range" ||
        message.reason === "unavailable"
      ) {
        return null;
      }
      return {
        ...current,
        pending: false,
        error: message.reason,
        pendingPurchaseCost: 0,
      };
    });
    return true;
  }

  if (message.type === "depot-state") {
    state.setBankSession(null);
    state.setShopSession(null);
    state.setMailboxSession(null);
    actions.depot.confirm(message);
    return true;
  }

  if (message.type === "depot-action-failed") {
    actions.depot.fail(message.reason);
    return true;
  }

  if (message.type === "market-opened") {
    const wasOpen = runtime.marketOpenRef.current;
    runtime.marketOpenRef.current = true;
    actions.market.opened(message);
    if (message.page < message.pageCount) {
      client.openMarket(message.page + 1);
    }
    if (message.page === 1 && !wasOpen) {
      const firstItem = message.items[0];
      if (runtime.marketSelectedItemRef.current === null && firstItem) {
        runtime.marketSelectedItemRef.current = firstItem.itemTypeId;
        state.setMarketSelectedItem(String(firstItem.itemTypeId));
        client.browseMarket(firstItem.itemTypeId);
      }
    }
    return true;
  }

  if (message.type === "market-offers") {
    actions.market.offersReceived(message);
    return true;
  }

  if (message.type === "market-own-offers-state") {
    actions.market.ownOffersReceived(message);
    return true;
  }

  if (message.type === "market-own-history-state") {
    actions.market.historyReceived(message);
    return true;
  }

  if (message.type === "market-transacted") {
    actions.market.transacted(message);
    state.setMarketToast(message.kind);
    if (message.kind === "created") {
      runtime.marketSelectedItemRef.current = null;
      state.setMarketSelectedItem(null);
    }
    if (runtime.marketOpenRef.current) {
      client.openMarket(1);
      const selectedItemTypeId = runtime.marketSelectedItemRef.current;
      if (selectedItemTypeId !== null) {
        client.browseMarket(selectedItemTypeId);
      }
    }
    return true;
  }

  if (message.type === "market-action-failed") {
    actions.market.fail(message.reason);
    return true;
  }

  if (message.type === "mailbox-opened") {
    state.setBankSession(null);
    state.setShopSession(null);
    actions.depot.reset();
    state.closeMarket();
    state.setMailboxSession({
      sessionId: message.sessionId,
      pending: false,
      error: null,
      sentRecipient: null,
    });
    return true;
  }

  if (message.type === "mail-sent") {
    state.setMailboxSession((current) =>
      current
        ? {
            ...current,
            pending: false,
            error: null,
            sentRecipient: message.recipientName,
          }
        : current,
    );
    return true;
  }

  if (message.type === "mail-action-failed") {
    state.setMailboxSession((current) => {
      if (!current) return current;
      if (message.reason === "out-of-range") return null;
      return { ...current, pending: false, error: message.reason };
    });
    return true;
  }

  if (message.type === "world-container-state") {
    // Only one loot window is ever open: a second corpse (or a bag opened
    // inside one) replaces the current view, and the server-side views it
    // supersedes are closed so they stop streaming updates.
    for (const session of state.lootSessions) {
      if (session.state.container.id === message.state.container.id) continue;
      client.closeWorldContainer(session.state.container.id);
    }
    state.setLootSessions([message]);
    state.setInventoryOpen(true);
    return true;
  }

  if (message.type === "world-container-closed") {
    state.setLootSessions((current) =>
      current.filter(
        (session) => session.state.container.id !== message.containerId,
      ),
    );
    return true;
  }

  return false;
}
