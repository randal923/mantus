import { useCallback, useState } from "react";
import type {
  GuildActionFailedReason,
  GuildInvitationEntry,
  GuildInvitationMessage,
  GuildState,
  GuildStateMessage,
} from "@tibia/protocol";

export interface GuildSessionState {
  readonly guild: GuildState | null;
  readonly invitations: ReadonlyArray<GuildInvitationEntry>;
  readonly pending: boolean;
  readonly error: GuildActionFailedReason | null;
}

export interface GuildSession {
  readonly state: GuildSessionState;
  readonly stateReceived: (message: GuildStateMessage) => void;
  readonly invitationReceived: (message: GuildInvitationMessage) => void;
  /** Marks a mutation as in flight (or failed to send). */
  readonly begin: (sent: boolean) => void;
  readonly fail: (reason: GuildActionFailedReason) => void;
  readonly dismissError: () => void;
  readonly reset: () => void;
}

const initialState: GuildSessionState = {
  guild: null,
  invitations: [],
  pending: false,
  error: null,
};

/**
 * Renders server guild state directly; membership, rank permissions, and
 * war transitions are validated and executed entirely server-side.
 */
export function useGuildSession(): GuildSession {
  const [state, setState] = useState<GuildSessionState>(initialState);

  const stateReceived = useCallback((message: GuildStateMessage) => {
    setState((current) => ({
      ...current,
      guild: message.guild,
      invitations: message.invitations,
      pending: false,
      error: null,
    }));
  }, []);

  const invitationReceived = useCallback(
    (message: GuildInvitationMessage) => {
      setState((current) => ({
        ...current,
        invitations: [
          ...current.invitations.filter(
            (invitation) => invitation.guildId !== message.guildId,
          ),
          {
            guildId: message.guildId,
            guildName: message.guildName,
            inviterName: message.inviterName,
          },
        ],
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

  const fail = useCallback((reason: GuildActionFailedReason) => {
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
    invitationReceived,
    begin,
    fail,
    dismissError,
    reset,
  };
}
