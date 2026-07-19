import type { GuildState, GuildWarEntry, GuildWarStatus } from "@tibia/protocol";
import type { GuildSnapshot } from "./GuildStore";

const WAR_STATUS: ReadonlyArray<GuildWarStatus> = [
  "pending",
  "active",
  "rejected",
  "canceled",
  "ended",
];

/**
 * Projects one member's view of the guild. Non-members get nothing, and
 * level-1 members do not receive the invite list (charter rule 6).
 */
export function projectGuildStateFor(input: {
  snapshot: GuildSnapshot;
  characterId: string;
  isOnline: (characterId: string) => boolean;
}): GuildState | null {
  const { snapshot, characterId, isOnline } = input;
  const me = snapshot.members.find(
    (member) => member.characterId === characterId,
  );
  if (!me) return null;
  const wars: GuildWarEntry[] = snapshot.wars.map((war) => {
    const initiatedByUs = war.guild1Id === snapshot.id;
    return {
      warId: war.id,
      enemyGuildName: initiatedByUs ? war.guild2Name : war.guild1Name,
      status: WAR_STATUS[war.status] ?? "ended",
      fragLimit: war.fragLimit,
      myKills: initiatedByUs ? war.guild1Kills : war.guild2Kills,
      enemyKills: initiatedByUs ? war.guild2Kills : war.guild1Kills,
      initiatedByUs,
    };
  });
  return {
    id: snapshot.id,
    name: snapshot.name,
    motd: snapshot.motd,
    myRankLevel: me.rankLevel,
    ranks: snapshot.ranks.map((rank) => ({
      level: rank.level,
      name: rank.name,
    })),
    members: snapshot.members.map((member) => ({
      characterId: member.characterId,
      name: member.name,
      rankLevel: member.rankLevel,
      nick: member.nick,
      online: isOnline(member.characterId),
    })),
    ...(me.rankLevel >= 2
      ? {
          invites: snapshot.invites.map((invite) => ({
            characterId: invite.characterId,
            name: invite.name,
          })),
        }
      : {}),
    wars,
  };
}
