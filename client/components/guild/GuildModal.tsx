"use client";

import { useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { GuildSessionState } from "../../hooks/useGuildSession";
import { Modal } from "../ui/Modal";
import { GuildCreateForm } from "./GuildCreateForm";
import { GuildInvitationsList } from "./GuildInvitationsList";
import { GuildInviteSection } from "./GuildInviteSection";
import { GuildMotdEditor } from "./GuildMotdEditor";
import { GuildRosterSection } from "./GuildRosterSection";
import { GuildSettingsSection } from "./GuildSettingsSection";
import { GuildWarsSection } from "./GuildWarsSection";

type GuildTab = "members" | "invites" | "wars" | "settings";

interface GuildModalProps {
  session: GuildSessionState;
  ownPlayerId: string;
  error: string | null;
  onClose: () => void;
  onCreate: (name: string) => void;
  onRespondInvitation: (guildId: string, accept: boolean) => void;
  onInvite: (targetName: string) => void;
  onRevokeInvite: (characterId: string) => void;
  onKick: (characterId: string) => void;
  onPromote: (characterId: string) => void;
  onDemote: (characterId: string) => void;
  onSetNick: (characterId: string, nick: string) => void;
  onSetMotd: (motd: string) => void;
  onSetRankName: (level: number, name: string) => void;
  onPassLeadership: (characterId: string) => void;
  onDisband: () => void;
  onLeave: () => void;
  onDeclareWar: (targetGuildName: string, fragLimit: number) => void;
  onRespondWar: (warId: string, accept: boolean) => void;
  onEndWar: (warId: string) => void;
}

/**
 * In-game guild management. Every control only sends an intent; the server
 * re-validates rank permissions at execution time, so this UI is purely a
 * view over the guild-state projection it was sent.
 */
export function GuildModal({
  session,
  ownPlayerId,
  error,
  onClose,
  onCreate,
  onRespondInvitation,
  onInvite,
  onRevokeInvite,
  onKick,
  onPromote,
  onDemote,
  onSetNick,
  onSetMotd,
  onSetRankName,
  onPassLeadership,
  onDisband,
  onLeave,
  onDeclareWar,
  onRespondWar,
  onEndWar,
}: GuildModalProps) {
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<GuildTab>("members");
  const guild = session.guild;
  const canSeeInvites = guild !== null && guild.myRankLevel >= 2;
  const tabs: ReadonlyArray<GuildTab> = canSeeInvites
    ? ["members", "invites", "wars", "settings"]
    : ["members", "wars", "settings"];
  const activeTab = tabs.includes(tab) ? tab : "members";

  return (
    <Modal
      size="wide"
      title={guild ? guild.name : t("guild.title")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {guild ? (
          <>
            <GuildMotdEditor
              motd={guild.motd}
              canEdit={guild.myRankLevel === 3}
              pending={session.pending}
              onSetMotd={onSetMotd}
            />
            <nav
              aria-label={t("guild.tabsLabel")}
              className="flex gap-1 rounded-lg border border-ui-gold/10 bg-black/20 p-1 self-start"
            >
              {tabs.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setTab(candidate)}
                  className={`rounded-md px-3 py-1.5 font-button text-sm tracking-wide uppercase transition-colors ${
                    activeTab === candidate
                      ? "bg-ui-accent/25 text-ui-text-bright"
                      : "text-ui-muted hover:text-ui-text"
                  }`}
                >
                  {t(`guild.tabs.${candidate}`)}
                </button>
              ))}
            </nav>
            <div aria-hidden className="ui-divider" />
            {activeTab === "members" && (
              <GuildRosterSection
                guild={guild}
                ownPlayerId={ownPlayerId}
                pending={session.pending}
                onKick={onKick}
                onPromote={onPromote}
                onDemote={onDemote}
                onSetNick={onSetNick}
              />
            )}
            {activeTab === "invites" && canSeeInvites && (
              <GuildInviteSection
                invites={guild.invites ?? []}
                pending={session.pending}
                onInvite={onInvite}
                onRevokeInvite={onRevokeInvite}
              />
            )}
            {activeTab === "wars" && (
              <GuildWarsSection
                wars={guild.wars}
                isLeader={guild.myRankLevel === 3}
                pending={session.pending}
                onDeclareWar={onDeclareWar}
                onRespondWar={onRespondWar}
                onEndWar={onEndWar}
              />
            )}
            {activeTab === "settings" && (
              <GuildSettingsSection
                guild={guild}
                ownPlayerId={ownPlayerId}
                pending={session.pending}
                onSetRankName={onSetRankName}
                onPassLeadership={onPassLeadership}
                onDisband={onDisband}
                onLeave={onLeave}
              />
            )}
          </>
        ) : (
          <>
            <GuildCreateForm pending={session.pending} onCreate={onCreate} />
            <div aria-hidden className="ui-divider" />
            <GuildInvitationsList
              invitations={session.invitations}
              pending={session.pending}
              onRespond={onRespondInvitation}
            />
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
