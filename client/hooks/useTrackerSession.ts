import { useCallback, useState } from "react";
import type {
  BestiaryEntryChangedMessage,
  TrackerEntry,
  TrackerStateMessage,
} from "@tibia/protocol";

export interface TrackerSessionState {
  /** Own tracked bestiary kills; the full list re-arrives on each mutation. */
  readonly bestiary: ReadonlyArray<TrackerEntry> | null;
  readonly bosstiary: ReadonlyArray<TrackerEntry> | null;
}

export interface TrackerSession {
  readonly state: TrackerSessionState;
  readonly stateReceived: (message: TrackerStateMessage) => void;
  /** Patches live kill counts from the shared per-kill push. */
  readonly entryChanged: (message: BestiaryEntryChangedMessage) => void;
  readonly reset: () => void;
}

const initialState: TrackerSessionState = {
  bestiary: null,
  bosstiary: null,
};

function patchEntries(
  entries: ReadonlyArray<TrackerEntry> | null,
  message: BestiaryEntryChangedMessage,
): ReadonlyArray<TrackerEntry> | null {
  if (!entries) return entries;
  return entries.map((entry) =>
    entry.raceId === message.raceId
      ? {
          ...entry,
          kills: message.kills,
          completed: message.kills >= entry.toKill,
        }
      : entry,
  );
}

/** Holds the latest server kill-tracker projections for both scopes. */
export function useTrackerSession(): TrackerSession {
  const [state, setState] = useState<TrackerSessionState>(initialState);

  const stateReceived = useCallback((message: TrackerStateMessage) => {
    setState((current) => ({
      ...current,
      [message.scope]: message.entries,
    }));
  }, []);

  const entryChanged = useCallback((message: BestiaryEntryChangedMessage) => {
    setState((current) =>
      message.scope === "bestiary"
        ? { ...current, bestiary: patchEntries(current.bestiary, message) }
        : { ...current, bosstiary: patchEntries(current.bosstiary, message) },
    );
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { state, stateReceived, entryChanged, reset };
}
