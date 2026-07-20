import { useCallback, useState } from "react";
import type {
  BestiaryActionFailedReason,
  BestiaryEntryChangedMessage,
  BosstiaryBossStateMessage,
  BosstiaryStateMessage,
} from "@tibia/protocol";

export interface BosstiarySessionState {
  readonly bosses: BosstiaryStateMessage | null;
  readonly boss: BosstiaryBossStateMessage | null;
  readonly pending: boolean;
  readonly error: BestiaryActionFailedReason | null;
}

export interface BosstiarySession {
  readonly state: BosstiarySessionState;
  readonly stateReceived: (message: BosstiaryStateMessage) => void;
  readonly bossReceived: (message: BosstiaryBossStateMessage) => void;
  /** Patches cached rows when the server pushes a milestone change. */
  readonly entryChanged: (message: BestiaryEntryChangedMessage) => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: BestiaryActionFailedReason) => void;
  readonly reset: () => void;
}

const initialState: BosstiarySessionState = {
  bosses: null,
  boss: null,
  pending: false,
  error: null,
};

/** Holds the latest server bosstiary projection. */
export function useBosstiarySession(): BosstiarySession {
  const [state, setState] = useState<BosstiarySessionState>(initialState);

  const stateReceived = useCallback((message: BosstiaryStateMessage) => {
    setState((current) => ({
      ...current,
      bosses: message,
      pending: false,
      error: null,
    }));
  }, []);

  const bossReceived = useCallback((message: BosstiaryBossStateMessage) => {
    setState((current) => ({
      ...current,
      boss: message,
      pending: false,
      error: null,
    }));
  }, []);

  const entryChanged = useCallback((message: BestiaryEntryChangedMessage) => {
    if (message.scope !== "bosstiary") return;
    setState((current) => ({
      ...current,
      bosses: current.bosses
        ? {
            ...current.bosses,
            entries: current.bosses.entries.map((entry) =>
              entry.raceId === message.raceId
                ? { ...entry, kills: message.kills }
                : entry,
            ),
          }
        : null,
      boss:
        current.boss?.raceId === message.raceId
          ? { ...current.boss, kills: message.kills }
          : current.boss,
    }));
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
    stateReceived,
    bossReceived,
    entryChanged,
    begin,
    fail,
    reset,
  };
}
