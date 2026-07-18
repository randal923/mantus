import { useCallback, useState } from "react";
import type {
  MarketActionFailedReason,
  MarketHistoryEntry,
  MarketItemEntry,
  MarketOfferEntry,
  MarketOffersMessage,
  MarketOpenedMessage,
  MarketOwnHistoryStateMessage,
  MarketOwnOfferEntry,
  MarketOwnOffersStateMessage,
  MarketTransactedMessage,
} from "@tibia/protocol";

export interface MarketItemOffers {
  readonly itemTypeId: number;
  readonly offers: ReadonlyArray<MarketOfferEntry>;
}

export interface MarketSessionState {
  readonly balance: number;
  readonly activeOfferCount: number;
  readonly pageCount: number;
  readonly nextPage: number;
  readonly items: ReadonlyArray<MarketItemEntry>;
  readonly itemOffers: MarketItemOffers | null;
  readonly ownOffers: ReadonlyArray<MarketOwnOfferEntry>;
  readonly history: ReadonlyArray<MarketHistoryEntry>;
  readonly pending: boolean;
  readonly error: MarketActionFailedReason | null;
}

export interface MarketSession {
  readonly session: MarketSessionState | null;
  readonly opened: (message: MarketOpenedMessage) => void;
  readonly offersReceived: (message: MarketOffersMessage) => void;
  readonly ownOffersReceived: (message: MarketOwnOffersStateMessage) => void;
  readonly historyReceived: (message: MarketOwnHistoryStateMessage) => void;
  readonly transacted: (message: MarketTransactedMessage) => void;
  readonly fail: (reason: MarketActionFailedReason) => void;
  /** Marks a mutation as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly reset: () => void;
}

/**
 * Renders server market state directly; the server re-validates every action.
 * Item pages accumulate like the shop: page 1 replaces, later pages append.
 */
export function useMarketSession(): MarketSession {
  const [session, setSession] = useState<MarketSessionState | null>(null);

  const opened = useCallback((message: MarketOpenedMessage) => {
    setSession((current) => {
      if (message.page === 1) {
        return {
          balance: message.balance,
          activeOfferCount: message.activeOfferCount,
          pageCount: message.pageCount,
          nextPage: 2,
          items: message.items,
          itemOffers: current?.itemOffers ?? null,
          ownOffers: current?.ownOffers ?? [],
          history: current?.history ?? [],
          pending: false,
          error: null,
        };
      }
      if (
        !current ||
        current.pageCount !== message.pageCount ||
        current.nextPage !== message.page
      ) {
        return current;
      }
      return {
        ...current,
        balance: message.balance,
        activeOfferCount: message.activeOfferCount,
        items: [...current.items, ...message.items],
        nextPage: current.nextPage + 1,
        error: null,
      };
    });
  }, []);

  const offersReceived = useCallback((message: MarketOffersMessage) => {
    setSession((current) =>
      current
        ? {
            ...current,
            itemOffers: {
              itemTypeId: message.itemTypeId,
              offers: message.offers,
            },
            error: null,
          }
        : current,
    );
  }, []);

  const ownOffersReceived = useCallback(
    (message: MarketOwnOffersStateMessage) => {
      setSession((current) =>
        current ? { ...current, ownOffers: message.offers } : current,
      );
    },
    [],
  );

  const historyReceived = useCallback(
    (message: MarketOwnHistoryStateMessage) => {
      setSession((current) =>
        current ? { ...current, history: message.entries } : current,
      );
    },
    [],
  );

  const transacted = useCallback((message: MarketTransactedMessage) => {
    setSession((current) =>
      current
        ? {
            ...current,
            balance: message.balance,
            pending: false,
            error: null,
          }
        : current,
    );
  }, []);

  const fail = useCallback((reason: MarketActionFailedReason) => {
    setSession((current) =>
      current ? { ...current, pending: false, error: reason } : current,
    );
  }, []);

  const begin = useCallback((sent: boolean) => {
    setSession((current) =>
      current
        ? { ...current, pending: sent, error: sent ? null : "failed" }
        : current,
    );
  }, []);

  const reset = useCallback(() => {
    setSession(null);
  }, []);

  return {
    session,
    opened,
    offersReceived,
    ownOffersReceived,
    historyReceived,
    transacted,
    fail,
    begin,
    reset,
  };
}
