import { useCallback, useState } from "react";
import type {
  CyclopediaActionFailedReason,
  CyclopediaCombatStateMessage,
  CyclopediaDeathsStateMessage,
  CyclopediaItemSummaryStateMessage,
  CyclopediaPvpKillsStateMessage,
} from "@tibia/protocol";

export interface CyclopediaSessionState {
  /** Own combat stats, computed server-side from live equipment. */
  readonly combat: CyclopediaCombatStateMessage | null;
  readonly deaths: CyclopediaDeathsStateMessage | null;
  readonly pvpKills: CyclopediaPvpKillsStateMessage | null;
  readonly itemSummary: CyclopediaItemSummaryStateMessage | null;
  readonly pending: boolean;
  readonly error: CyclopediaActionFailedReason | null;
}

export interface CyclopediaSession {
  readonly state: CyclopediaSessionState;
  readonly combatReceived: (message: CyclopediaCombatStateMessage) => void;
  readonly deathsReceived: (message: CyclopediaDeathsStateMessage) => void;
  readonly pvpKillsReceived: (
    message: CyclopediaPvpKillsStateMessage,
  ) => void;
  readonly itemSummaryReceived: (
    message: CyclopediaItemSummaryStateMessage,
  ) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: CyclopediaActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: CyclopediaSessionState = {
  combat: null,
  deaths: null,
  pvpKills: null,
  itemSummary: null,
  pending: false,
  error: null,
};

/**
 * Holds the per-view cyclopedia character projections. Every view is an
 * authorized, paged server projection over the own character only; this
 * state is a view over `cyclopedia-*-state` messages.
 */
export function useCyclopediaSession(): CyclopediaSession {
  const [state, setState] = useState<CyclopediaSessionState>(initialState);

  const combatReceived = useCallback(
    (message: CyclopediaCombatStateMessage) => {
      setState((current) => ({
        ...current,
        combat: message,
        pending: false,
        error: null,
      }));
    },
    [],
  );

  const deathsReceived = useCallback(
    (message: CyclopediaDeathsStateMessage) => {
      setState((current) => ({
        ...current,
        deaths: message,
        pending: false,
        error: null,
      }));
    },
    [],
  );

  const pvpKillsReceived = useCallback(
    (message: CyclopediaPvpKillsStateMessage) => {
      setState((current) => ({
        ...current,
        pvpKills: message,
        pending: false,
        error: null,
      }));
    },
    [],
  );

  const itemSummaryReceived = useCallback(
    (message: CyclopediaItemSummaryStateMessage) => {
      setState((current) => ({
        ...current,
        itemSummary: message,
        pending: false,
        error: null,
      }));
    },
    [],
  );

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: CyclopediaActionFailedReason) => {
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
    combatReceived,
    deathsReceived,
    pvpKillsReceived,
    itemSummaryReceived,
    begin,
    fail,
    dismissError,
    reset,
  };
}
