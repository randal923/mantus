"use client";

import { useState } from "react";
import { GUILD_LIMITS, type GuildMemberEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface GuildMemberRowProps {
  member: GuildMemberEntry;
  rankName: string;
  isOwn: boolean;
  myRankLevel: number;
  isLeader: boolean;
  pending: boolean;
  onKick: (characterId: string) => void;
  onPromote: (characterId: string) => void;
  onDemote: (characterId: string) => void;
  onSetNick: (characterId: string, nick: string) => void;
}

/**
 * One roster row. The controls shown mirror the server's permission model
 * (leader promotes/demotes, vice+ kicks lower ranks, nick for self/leader);
 * the server re-checks every action at execution time regardless.
 */
export function GuildMemberRow({
  member,
  rankName,
  isOwn,
  myRankLevel,
  isLeader,
  pending,
  onKick,
  onPromote,
  onDemote,
  onSetNick,
}: GuildMemberRowProps) {
  const { t } = useAppTranslation();
  const [editingNick, setEditingNick] = useState(false);
  const [nick, setNick] = useState(member.nick);
  const canKick = !isOwn && myRankLevel >= 2 && member.rankLevel < myRankLevel;
  const canPromote = isLeader && member.rankLevel === 1;
  const canDemote = isLeader && member.rankLevel === 2;
  const canEditNick = isOwn || isLeader;

  return (
    <li className="flex items-center gap-3 rounded-md border border-ui-stone-light/10 bg-black/20 px-3 py-2">
      <span
        aria-label={
          member.online ? t("guild.online") : t("guild.offline")
        }
        className={`size-2 shrink-0 rounded-full ${
          member.online
            ? "bg-ui-success shadow-[0_0_6px_currentColor] text-ui-success"
            : "bg-ui-stone-light/40"
        }`}
      />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className={isOwn ? "text-ui-gold" : "text-ui-text-bright"}>
          {member.name}
        </span>
        {member.nick && (
          <span className="text-ui-muted"> “{member.nick}”</span>
        )}
      </span>
      <span className="w-28 shrink-0 truncate text-xs tracking-wide text-ui-muted uppercase">
        {rankName}
      </span>
      {editingNick ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            onSetNick(member.characterId, nick.trim());
            setEditingNick(false);
          }}
        >
          <Input
            aria-label={t("guild.nickPlaceholder")}
            placeholder={t("guild.nickPlaceholder")}
            value={nick}
            maxLength={GUILD_LIMITS.maxNickLength}
            onChange={(event) => setNick(event.target.value)}
            className="w-32 [&>input]:h-8 [&>input]:text-xs"
          />
          <Button size="sm" type="submit" disabled={pending}>
            {t("guild.save")}
          </Button>
        </form>
      ) : (
        <span className="flex shrink-0 gap-1.5">
          {canEditNick && (
            <Button size="sm" onClick={() => setEditingNick(true)}>
              {t("guild.setNick")}
            </Button>
          )}
          {canPromote && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => onPromote(member.characterId)}
            >
              {t("guild.promote")}
            </Button>
          )}
          {canDemote && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => onDemote(member.characterId)}
            >
              {t("guild.demote")}
            </Button>
          )}
          {canKick && (
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => onKick(member.characterId)}
            >
              {t("guild.kick")}
            </Button>
          )}
        </span>
      )}
    </li>
  );
}
