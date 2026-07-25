import { useCallback, useRef, useState } from "react";
import type {
  FriendStateMessage,
  VipActionFailedReason,
  VipEntry,
  VipGroup,
  VipStateMessage,
  VipStatusChangedMessage,
} from "@tibia/protocol";

export interface VipSessionState {
  readonly entries: ReadonlyArray<VipEntry>;
  readonly groups: ReadonlyArray<VipGroup>;
  /** Reciprocal friendships and pending requests (Feature 65). */
  readonly friends: FriendStateMessage | null;
  readonly pending: boolean;
  readonly error: VipActionFailedReason | null;
}

export interface VipSession {
  readonly state: VipSessionState;
  readonly stateReceived: (message: VipStateMessage) => void;
  readonly friendStateReceived: (message: FriendStateMessage) => void;
  /** Returns the affected entry so callers can surface login notices. */
  readonly statusChanged: (
    message: VipStatusChangedMessage,
  ) => VipEntry | null;
  /** Marks a mutation as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: VipActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: VipSessionState = {
  entries: [],
  groups: [],
  friends: null,
  pending: false,
  error: null,
};

/**
 * Renders the server's private VIP-list projection; names resolve and
 * limits apply entirely server-side. Entries are mirrored in a ref so the
 * socket handler can read the latest list synchronously.
 */
export function useVipSession(): VipSession {
  const [state, setState] = useState<VipSessionState>(initialState);
  const entriesRef = useRef<ReadonlyArray<VipEntry>>([]);

  const stateReceived = useCallback((message: VipStateMessage) => {
    entriesRef.current = message.entries;
    setState((current) => ({
      ...current,
      entries: message.entries,
      groups: message.groups,
      pending: false,
      error: null,
    }));
  }, []);

  const friendStateReceived = useCallback((message: FriendStateMessage) => {
    setState((current) => ({
      ...current,
      friends: message,
      pending: false,
      error: null,
    }));
  }, []);

  const statusChanged = useCallback(
    (message: VipStatusChangedMessage): VipEntry | null => {
      const existing = entriesRef.current.find(
        (entry) => entry.characterId === message.characterId,
      );
      if (!existing) return null;
      const affected: VipEntry = { ...existing, online: message.online };
      const entries = entriesRef.current.map((entry) =>
        entry.characterId === message.characterId ? affected : entry,
      );
      entriesRef.current = entries;
      setState((current) => ({ ...current, entries }));
      return affected;
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

  const fail = useCallback((reason: VipActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const dismissError = useCallback(() => {
    setState((current) =>
      current.error ? { ...current, error: null } : current,
    );
  }, []);

  const reset = useCallback(() => {
    entriesRef.current = [];
    setState(initialState);
  }, []);

  return {
    state,
    stateReceived,
    friendStateReceived,
    statusChanged,
    begin,
    fail,
    dismissError,
    reset,
  };
}
