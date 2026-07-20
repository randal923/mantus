import { useCallback, useState } from "react";
import type {
  BestiaryActionFailedReason,
  BestiaryCreaturesStateMessage,
  BestiaryEntryChangedMessage,
  BestiaryMonsterStateMessage,
} from "@tibia/protocol";

export interface BestiarySessionState {
  /** Full preloaded bestiary; kept fresh by per-kill entry-changed pushes. */
  readonly creatures: BestiaryCreaturesStateMessage | null;
  readonly monster: BestiaryMonsterStateMessage | null;
  readonly pending: boolean;
  readonly error: BestiaryActionFailedReason | null;
}

export interface BestiarySession {
  readonly state: BestiarySessionState;
  readonly creaturesReceived: (message: BestiaryCreaturesStateMessage) => void;
  readonly monsterReceived: (message: BestiaryMonsterStateMessage) => void;
  /** Patches cached rows from the server's per-kill pushes. */
  readonly entryChanged: (message: BestiaryEntryChangedMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: BestiaryActionFailedReason) => void;
  readonly reset: () => void;
}

const initialState: BestiarySessionState = {
  creatures: null,
  monster: null,
  pending: false,
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

  const entryChanged = useCallback((message: BestiaryEntryChangedMessage) => {
    if (message.scope !== "bestiary") return;
    setState((current) => {
      const monster =
        current.monster?.raceId === message.raceId
          ? current.monster.stage === message.stage
            ? { ...current.monster, kills: message.kills }
            : // Stage widened: drop the sheet so reopening refetches it.
              null
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

  const fail = useCallback((reason: BestiaryActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    creaturesReceived,
    monsterReceived,
    entryChanged,
    begin,
    fail,
    reset,
  };
}
