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
      className="ui-panel-frame pointer-events-auto flex h-full w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden p-4"
    >
      <header className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 font-display text-2xl font-bold tracking-[0.12em] text-ui-text-bright uppercase">
          {t("party.title")}
        </h2>
        <CloseButton label={t("modal.close")} onClick={onClose} />
      </header>
      <div aria-hidden className="ui-divider my-4" />

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-400/20 bg-red-950/20 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {party ? (
        <>
          <section className="rounded-xl border border-ui-gold/15 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm tracking-[0.15em] text-ui-gold uppercase">
                  {t("party.sharedExp")}
                </h3>
                <p
                  className={`mt-1 text-sm ${
                    party.sharedExpActive &&
                    party.sharedExpStatus === "ok"
                      ? "text-emerald-400"
                      : "text-ui-muted"
                  }`}
                >
                  {party.sharedExpActive
                    ? t(`party.sharedExpStatus.${party.sharedExpStatus}`)
                    : t("party.sharedExpOff")}
                </p>
              </div>
              {isLeader ? (
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={party.sharedExpActive}
                    onChange={(event) =>
                      onSetSharedExp(event.target.checked)
                    }
                    className="peer sr-only"
                  />
                  <span className="h-7 w-12 rounded-full border border-ui-stone-light/20 bg-black/40 transition-colors peer-checked:border-ui-gold/45 peer-checked:bg-ui-gold-deep peer-focus-visible:ring-2 peer-focus-visible:ring-ui-gold/60 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-ui-muted after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-ui-gold" />
                  <span className="sr-only">{t("party.sharedExp")}</span>
                </label>
              ) : (
                <span
                  className={`flex size-8 items-center justify-center rounded-md border ${
                    party.sharedExpActive
                      ? "border-emerald-400/25 bg-emerald-950/20 text-emerald-400"
                      : "border-ui-stone-light/15 bg-black/20 text-ui-muted"
                  }`}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {party.sharedExpActive ? (
                      <path d="m5 12 4 4L19 6" />
                    ) : (
                      <path d="m7 7 10 10M17 7 7 17" />
                    )}
                  </svg>
                </span>
              )}
            </div>
          </section>

          <div className="mt-5 flex items-center gap-3">
            <h3 className="min-w-0 flex-1 font-display text-lg tracking-wide text-ui-gold">
              {t("party.members")}
            </h3>
            <span className="flex min-w-10 items-center justify-center rounded-full border border-ui-gold/25 bg-ui-gold-deep/40 px-3 py-1 text-sm font-bold tabular-nums text-ui-text-bright">
              {party.members.length}
            </span>
          </div>

          <div className="ui-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <ul
              aria-label={t("party.membersLabel")}
              className="space-y-2"
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
              <section className="mt-5">
                <div className="flex items-center gap-3">
                  <h3 className="min-w-0 flex-1 font-display text-lg tracking-wide text-ui-gold">
                    {t("party.invited")}
                  </h3>
                  <span className="flex min-w-10 items-center justify-center rounded-full border border-ui-gold/25 bg-ui-gold-deep/40 px-3 py-1 text-sm font-bold tabular-nums text-ui-text-bright">
                    {party.invited.length}
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {party.invited.map((invitee) => (
                    <li
                      key={invitee.id}
                      className="flex items-center gap-3 rounded-xl border border-ui-gold/10 bg-black/25 p-3 text-sm"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-ui-gold/20 bg-ui-panel-deep/80 text-ui-muted">
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          className="size-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="9" cy="8" r="3.25" />
                          <path d="M3.5 19a5.5 5.5 0 0 1 11 0M18 7v6M15 10h6" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ui-muted">
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
              </section>
            )}
          </div>
        </>
      ) : (
        <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-ui-gold/15 bg-black/15 px-6 text-center">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-10 text-ui-gold/55"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 19.5a4.5 4.5 0 0 1 8.5 0" />
          </svg>
          <p className="mt-3 text-sm leading-6 text-ui-muted">
            {t("party.empty")}
          </p>
        </div>
      )}

      {canInvite && (
        <form
          className="mt-4 flex items-end gap-2"
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
        <Button
          variant="danger"
          size="sm"
          className="mt-3 w-full"
          onClick={onLeave}
        >
          {t("party.leave")}
        </Button>
      )}
    </section>
  );
}
