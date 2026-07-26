import { useCallback, useState } from "react";
import type {
  CharacterProfileMessage,
  ProfileActionFailedReason,
  ProfileStateMessage,
} from "@tibia/protocol";

export interface ProfileSessionState {
  /** Own private projection: every catalog entry with its granted flag. */
  readonly profile: ProfileStateMessage | null;
  /** The last looked-up public profile of another character. */
  readonly publicProfile: CharacterProfileMessage | null;
  readonly pending: boolean;
  readonly error: ProfileActionFailedReason | null;
}

export interface ProfileSession {
  readonly state: ProfileSessionState;
  readonly stateReceived: (message: ProfileStateMessage) => void;
  readonly publicProfileReceived: (
    message: CharacterProfileMessage,
  ) => void;
  readonly clearPublicProfile: () => void;
  /** Marks a request as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: ProfileActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: ProfileSessionState = {
  profile: null,
  publicProfile: null,
  pending: false,
  error: null,
};

/**
 * Renders the server's profile projections. Grants, title ownership, and
 * lookup rate limits are enforced entirely server-side; this state is a
 * view over `profile-state` and `character-profile` messages.
 */
export function useProfileSession(): ProfileSession {
  const [state, setState] = useState<ProfileSessionState>(initialState);

  const stateReceived = useCallback((message: ProfileStateMessage) => {
    setState((current) => ({
      ...current,
      profile: message,
      pending: false,
      error: null,
    }));
  }, []);

  const publicProfileReceived = useCallback(
    (message: CharacterProfileMessage) => {
      setState((current) => ({
        ...current,
        publicProfile: message,
        pending: false,
        error: null,
      }));
    },
    [],
  );

  const clearPublicProfile = useCallback(() => {
    setState((current) =>
      current.publicProfile ? { ...current, publicProfile: null } : current,
    );
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
  }, []);

  const fail = useCallback((reason: ProfileActionFailedReason) => {
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
    publicProfileReceived,
    clearPublicProfile,
    begin,
    fail,
    dismissError,
    reset,
  };
}
