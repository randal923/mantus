"use client";

import type { GuildState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { GuildMemberRow } from "./GuildMemberRow";

interface GuildRosterSectionProps {
  guild: GuildState;
  ownPlayerId: string;
  pending: boolean;
  onKick: (characterId: string) => void;
  onPromote: (characterId: string) => void;
  onDemote: (characterId: string) => void;
  onSetNick: (characterId: string, nick: string) => void;
}

/** The member roster with per-row controls gated by the viewer's rank. */
export function GuildRosterSection({
  guild,
  ownPlayerId,
  pending,
  onKick,
  onPromote,
  onDemote,
  onSetNick,
}: GuildRosterSectionProps) {
  const { t } = useAppTranslation();
  const isLeader = guild.myRankLevel === 3;
  const rankNameOf = (level: number) =>
    guild.ranks.find((rank) => rank.level === level)?.name ?? "?";

  return (
    <section aria-label={t("guild.membersTitle")} className="flex flex-col gap-2">
      <h3 className="font-display text-sm tracking-widest text-ui-gold uppercase">
        {t("guild.membersTitle")}{" "}
        <span className="text-ui-muted">({guild.members.length})</span>
      </h3>
      <ul className="ui-scrollbar flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-1">
        {guild.members.map((member) => (
          <GuildMemberRow
            key={member.characterId}
            member={member}
            rankName={rankNameOf(member.rankLevel)}
            isOwn={member.characterId === ownPlayerId}
            myRankLevel={guild.myRankLevel}
            isLeader={isLeader}
            pending={pending}
            onKick={onKick}
            onPromote={onPromote}
            onDemote={onDemote}
            onSetNick={onSetNick}
          />
        ))}
      </ul>
    </section>
  );
}
