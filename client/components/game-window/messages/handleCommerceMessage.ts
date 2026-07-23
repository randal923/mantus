import { GOLD_COIN_TYPE_ID } from "@tibia/protocol";
import type { ServerMessage } from "@tibia/protocol";
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
      pending: false,
      pendingOfferId: null,
      purchasedOfferId: null,
      error: null,
    });
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

  if (message.type === "shop-opened") {
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
          coinWeights: message.coinWeights,
          pageCount: message.pageCount,
          nextPage: 2,
          entries: message.entries,
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
    actions.inventory.rejectPreview();
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
    state.setLootSession(message);
    state.setInventoryOpen(true);
    return true;
  }

  if (message.type === "world-container-closed") {
    state.setLootSession((current) =>
      current?.state.container.id === message.containerId ? null : current,
    );
    return true;
  }

  return false;
}
