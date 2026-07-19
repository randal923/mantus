import { useCallback, useState } from "react";
import type {
  HouseActionFailedReason,
  HouseListMessage,
  HouseState,
  HouseStateMessage,
  HouseTransferIncomingMessage,
} from "@tibia/protocol";

export interface HouseSessionState {
  readonly house: HouseState | null;
  readonly list: HouseListMessage | null;
  readonly incomingOffers: ReadonlyArray<HouseTransferIncomingMessage>;
  readonly pending: boolean;
  readonly error: HouseActionFailedReason | null;
}

export interface HouseSession {
  readonly state: HouseSessionState;
  readonly stateReceived: (message: HouseStateMessage) => void;
  readonly listReceived: (message: HouseListMessage) => void;
  readonly offerReceived: (message: HouseTransferIncomingMessage) => void;
  readonly offerResolved: (houseId: number) => void;
  readonly offerCancelledByName: (houseName: string) => void;
  /** Marks a mutation as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: HouseActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: HouseSessionState = {
  house: null,
  list: null,
  incomingOffers: [],
  pending: false,
  error: null,
};

/**
 * Renders server house state directly; ownership, access, prices, and rent
 * are validated and executed entirely server-side.
 */
export function useHouseSession(): HouseSession {
  const [state, setState] = useState<HouseSessionState>(initialState);

  const stateReceived = useCallback((message: HouseStateMessage) => {
    setState((current) => ({
      ...current,
      house: message.house,
      pending: false,
      error: null,
    }));
  }, []);

  const listReceived = useCallback((message: HouseListMessage) => {
    setState((current) => ({
      ...current,
      list: message,
      pending: false,
      error: null,
    }));
  }, []);

  const offerReceived = useCallback(
    (message: HouseTransferIncomingMessage) => {
      setState((current) => ({
        ...current,
        incomingOffers: [
          ...current.incomingOffers.filter(
            (offer) => offer.houseId !== message.houseId,
          ),
          message,
        ],
      }));
    },
    [],
  );

  const offerResolved = useCallback((houseId: number) => {
    setState((current) => ({
      ...current,
      incomingOffers: current.incomingOffers.filter(
        (offer) => offer.houseId !== houseId,
      ),
    }));
  }, []);

  const offerCancelledByName = useCallback((houseName: string) => {
    setState((current) => ({
      ...current,
      incomingOffers: current.incomingOffers.filter(
        (offer) => offer.houseName !== houseName,
      ),
    }));
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: HouseActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const dismissError = useCallback(() => {
    setState((current) =>
      current.error ? { ...current, error: null } : current,
    );
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    stateReceived,
    listReceived,
    offerReceived,
    offerResolved,
    offerCancelledByName,
    begin,
    fail,
    dismissError,
    reset,
  };
}
