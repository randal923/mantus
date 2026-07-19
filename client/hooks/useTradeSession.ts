import { useCallback, useState } from "react";
import type {
  TradeActionFailedReason,
  TradeStateMessage,
} from "@tibia/protocol";

export interface TradeSessionState {
  readonly partnerId: string;
  readonly partnerName: string;
  readonly ownOffer: TradeStateMessage["ownOffer"];
  readonly partnerOffer: TradeStateMessage["partnerOffer"];
  readonly ownAccepted: boolean;
  readonly partnerAccepted: boolean;
  readonly pending: boolean;
  readonly error: TradeActionFailedReason | null;
}

export interface TradeSession {
  readonly session: TradeSessionState | null;
  readonly stateReceived: (message: TradeStateMessage) => void;
  readonly fail: (reason: TradeActionFailedReason) => void;
  /** Marks a mutation as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly reset: () => void;
}

/**
 * Renders server trade state directly; every offer, accept, and the swap
 * itself is validated and executed server-side.
 */
export function useTradeSession(): TradeSession {
  const [session, setSession] = useState<TradeSessionState | null>(null);

  const stateReceived = useCallback((message: TradeStateMessage) => {
    setSession({
      partnerId: message.partnerId,
      partnerName: message.partnerName,
      ownOffer: message.ownOffer,
      partnerOffer: message.partnerOffer,
      ownAccepted: message.ownAccepted,
      partnerAccepted: message.partnerAccepted,
      pending: false,
      error: null,
    });
  }, []);

  const fail = useCallback((reason: TradeActionFailedReason) => {
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

  return { session, stateReceived, fail, begin, reset };
}
