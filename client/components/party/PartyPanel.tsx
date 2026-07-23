"use client";

import { useState } from "react";
import type { PartyState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { CloseButton } from "../ui/CloseButton";
import { Input } from "../ui/Input";
import { PartyMemberRow } from "./PartyMemberRow";

interface PartyPanelProps {
  party: PartyState | null;
  ownPlayerId: string;
  error: string | null;
  onInvite: (targetName: string) => void;
  onRevokeInvite: (targetPlayerId: string) => void;
  onKick: (targetPlayerId: string) => void;
  onPassLeadership: (targetPlayerId: string) => void;
  onSetSharedExp: (enabled: boolean) => void;
  onLeave: () => void;
  onClose: () => void;
}

/**
 * Renders the server's party-state projection. Every action here is only an
 * intent; the server re-validates membership, leadership, and limits.
 */
export function PartyPanel({
  party,
  ownPlayerId,
  error,
  onInvite,
  onRevokeInvite,
  onKick,
  onPassLeadership,
  onSetSharedExp,
  onLeave,
  onClose,
}: PartyPanelProps) {
  const { t } = useAppTranslation();
  const [inviteName, setInviteName] = useState("");
  const isLeader = party?.leaderId === ownPlayerId;
  const canInvite = !party || isLeader;

  const submitInvite = () => {
    const name = inviteName.trim();
    if (name.length === 0) return;
    onInvite(name);
    setInviteName("");
  };

  return (
    <section
      aria-label={t("party.title")}
      className="ui-panel-frame pointer-events-auto w-64 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-ui-text-bright uppercase">
          {t("party.title")}
        </h2>
        <CloseButton label={t("modal.close")} onClick={onClose} />
      </div>
      {party ? (
        <>
          <ul
            aria-label={t("party.membersLabel")}
            className="ui-scrollbar max-h-64 space-y-1 overflow-y-auto"
          >
            {party.members.map((member) => (
              <PartyMemberRow
                key={member.id}
                member={member}
                isOwn={member.id === ownPlayerId}
                sharedExpActive={party.sharedExpActive}
                showLeaderControls={isLeader}
                onKick={onKick}
                onPassLeadership={onPassLeadership}
              />
            ))}
          </ul>
          {party.invited.length > 0 && (
            <div className="mt-2">
              <h3 className="text-sm tracking-wide text-ui-muted uppercase">
                {t("party.invited")}
              </h3>
              <ul className="space-y-1">
                {party.invited.map((invitee) => (
                  <li
                    key={invitee.id}
                    className="flex items-center justify-between gap-2 px-1 text-sm"
                  >
                    <span className="truncate text-ui-muted">
                      {invitee.name}
                    </span>
                    {isLeader && (
                      <Button
                        size="sm"
                        onClick={() => onRevokeInvite(invitee.id)}
                      >
                        {t("party.revoke")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="ui-divider my-2" />
          {isLeader ? (
            <label className="flex items-center justify-between gap-2 px-1 text-sm text-ui-text">
              <span>{t("party.sharedExp")}</span>
              <input
                type="checkbox"
                checked={party.sharedExpActive}
                onChange={(event) => onSetSharedExp(event.target.checked)}
              />
            </label>
          ) : (
            <p className="px-1 text-sm text-ui-text">
              {t("party.sharedExp")}:{" "}
              {party.sharedExpActive
                ? t("party.sharedExpOn")
                : t("party.sharedExpOff")}
            </p>
          )}
          {party.sharedExpActive && (
            <p
              className={`mt-1 px-1 text-sm ${
                party.sharedExpStatus === "ok"
                  ? "text-green-400"
                  : "text-amber-400"
              }`}
            >
              {t(`party.sharedExpStatus.${party.sharedExpStatus}`)}
            </p>
          )}
        </>
      ) : (
        <p className="px-1 text-sm text-ui-muted">{t("party.empty")}</p>
      )}
      {canInvite && (
        <form
          className="mt-2 flex items-end gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submitInvite();
          }}
        >
          <Input
            aria-label={t("party.invitePlaceholder")}
            placeholder={t("party.invitePlaceholder")}
            value={inviteName}
            maxLength={20}
            onChange={(event) => setInviteName(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Button size="sm" type="submit">
            {t("party.invite")}
          </Button>
        </form>
      )}
      {party && (
        <Button variant="danger" size="sm" className="mt-2" onClick={onLeave}>
          {t("party.leave")}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
