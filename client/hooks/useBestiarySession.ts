import { useCallback, useState } from "react";
import type {
  BestiaryActionFailedReason,
  BestiaryCreaturesStateMessage,
  BestiaryEntryChangedMessage,
  BestiaryMonsterStateMessage,
  WikiItemSourcesStateMessage,
} from "@tibia/protocol";

export interface BestiarySessionState {
  /** Full preloaded bestiary; kept fresh by per-kill entry-changed pushes. */
  readonly creatures: BestiaryCreaturesStateMessage | null;
  readonly monster: BestiaryMonsterStateMessage | null;
  readonly itemSources: WikiItemSourcesStateMessage | null;
  readonly pending: boolean;
  readonly sourcesPending: boolean;
  readonly error: BestiaryActionFailedReason | null;
}

export interface BestiarySession {
  readonly state: BestiarySessionState;
  readonly creaturesReceived: (message: BestiaryCreaturesStateMessage) => void;
  readonly monsterReceived: (message: BestiaryMonsterStateMessage) => void;
  readonly itemSourcesReceived: (message: WikiItemSourcesStateMessage) => void;
  /** Patches cached rows from the server's per-kill pushes. */
  readonly entryChanged: (message: BestiaryEntryChangedMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly beginSources: (sent: boolean) => void;
  readonly fail: (reason: BestiaryActionFailedReason) => void;
  readonly reset: () => void;
}

const initialState: BestiarySessionState = {
  creatures: null,
  monster: null,
  itemSources: null,
  pending: false,
  sourcesPending: false,
  error: null,
};

/** Holds the latest server bestiary projections; unlocks are server-side. */
export function useBestiarySession(): BestiarySession {
  const [state, setState] = useState<BestiarySessionState>(initialState);

  const creaturesReceived = useCallback(
    (message: BestiaryCreaturesStateMessage) => {
      setState((current) => ({
        ...current,
        creatures: message,
        pending: false,
        error: null,
      }));
    },
    [],
  );

  const monsterReceived = useCallback(
    (message: BestiaryMonsterStateMessage) => {
      setState((current) => ({
        ...current,
        monster: message,
        pending: false,
        error: null,
      }));
    },
    [],
  );

  const itemSourcesReceived = useCallback(
    (message: WikiItemSourcesStateMessage) => {
      setState((current) => ({
        ...current,
        itemSources: message,
        sourcesPending: false,
        error: null,
      }));
    },
    [],
  );

  const entryChanged = useCallback((message: BestiaryEntryChangedMessage) => {
    if (message.scope !== "bestiary") return;
    setState((current) => {
      const monster =
        current.monster?.raceId === message.raceId
          ? {
              ...current.monster,
              kills: message.kills,
              stage: message.stage,
            }
          : current.monster;
      return {
        ...current,
        creatures: current.creatures
          ? {
              ...current.creatures,
              entries: current.creatures.entries.map((entry) =>
                entry.raceId === message.raceId
                  ? { ...entry, kills: message.kills, stage: message.stage }
                  : entry,
              ),
            }
          : null,
        monster,
      };
    });
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const beginSources = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      sourcesPending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: BestiaryActionFailedReason) => {
    setState((current) => ({
      ...current,
      pending: false,
      sourcesPending: false,
      error: reason,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    creaturesReceived,
    monsterReceived,
    itemSourcesReceived,
    entryChanged,
    begin,
    beginSources,
    fail,
    reset,
  };
}
