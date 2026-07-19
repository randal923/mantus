import { useCallback, useState } from "react";
import type {
  PartyActionFailedReason,
  PartyInvitationMessage,
  PartyState,
  PartyStateMessage,
} from "@tibia/protocol";

export interface PartyInvitation {
  readonly leaderId: string;
  readonly leaderName: string;
  readonly partyId: string;
}

export interface PartySessionState {
  readonly party: PartyState | null;
  readonly invitation: PartyInvitation | null;
  readonly pending: boolean;
  readonly error: PartyActionFailedReason | null;
}

export interface PartySession {
  readonly state: PartySessionState;
  readonly stateReceived: (message: PartyStateMessage) => void;
  readonly invitationReceived: (message: PartyInvitationMessage) => void;
  readonly invitationRevoked: (leaderId: string) => void;
  readonly fail: (reason: PartyActionFailedReason) => void;
  /** Marks a mutation as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: PartySessionState = {
  party: null,
  invitation: null,
  pending: false,
  error: null,
};

/**
 * Renders server party state directly; membership, leadership, limits, and
 * the shared-experience rules are all validated and executed server-side.
 */
export function usePartySession(): PartySession {
  const [state, setState] = useState<PartySessionState>(initialState);

  const stateReceived = useCallback((message: PartyStateMessage) => {
    setState((current) => ({
      ...current,
      party: message.party,
      // Joining a party voids any invitation still on screen.
      invitation: message.party ? null : current.invitation,
      pending: false,
      error: null,
    }));
  }, []);

  const invitationReceived = useCallback(
    (message: PartyInvitationMessage) => {
      setState((current) => ({
        ...current,
        invitation: {
          leaderId: message.leaderId,
          leaderName: message.leaderName,
          partyId: message.partyId,
        },
      }));
    },
    [],
  );

  const invitationRevoked = useCallback((leaderId: string) => {
    setState((current) =>
      current.invitation?.leaderId === leaderId
        ? { ...current, invitation: null }
        : current,
    );
  }, []);

  const fail = useCallback((reason: PartyActionFailedReason) => {
    setState((current) => ({ ...current, pending: false, error: reason }));
  }, []);

  const begin = useCallback((sent: boolean) => {
    setState((current) => ({
      ...current,
      pending: sent,
      error: sent ? null : current.error,
    }));
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
    invitationReceived,
    invitationRevoked,
    fail,
    begin,
    dismissError,
    reset,
  };
}
