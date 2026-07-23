"use client";

import { useState } from "react";
import { GUILD_LIMITS, type GuildState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";

interface GuildSettingsSectionProps {
  guild: GuildState;
  ownPlayerId: string;
  pending: boolean;
  onSetRankName: (level: number, name: string) => void;
  onPassLeadership: (characterId: string) => void;
  onDisband: () => void;
  onLeave: () => void;
}

/** Leader tools (rank names, pass leadership, disband) plus leave-guild. */
export function GuildSettingsSection({
  guild,
  ownPlayerId,
  pending,
  onSetRankName,
  onPassLeadership,
  onDisband,
  onLeave,
}: GuildSettingsSectionProps) {
  const { t } = useAppTranslation();
  const isLeader = guild.myRankLevel === 3;
  const [rankNames, setRankNames] = useState<Record<number, string>>(() =>
    Object.fromEntries(guild.ranks.map((rank) => [rank.level, rank.name])),
  );
  const otherMembers = guild.members.filter(
    (member) => member.characterId !== ownPlayerId,
  );
  const [heirId, setHeirId] = useState(otherMembers[0]?.characterId ?? "");
  const [confirmingDisband, setConfirmingDisband] = useState(false);

  return (
    <section aria-label={t("guild.settingsTitle")} className="flex max-w-lg flex-col gap-4">
      <h3 className="font-display text-sm tracking-widest text-ui-gold uppercase">
        {t("guild.settingsTitle")}
      </h3>
      {isLeader ? (
        <>
          <div className="flex flex-col gap-2">
            <h4 className="text-sm tracking-widest text-ui-muted uppercase">
              {t("guild.rankNames")}
            </h4>
            {guild.ranks.map((rank) => (
              <form
                key={rank.level}
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = rankNames[rank.level]?.trim() ?? "";
                  if (name.length === 0) return;
                  onSetRankName(rank.level, name);
                }}
              >
                <Input
                  aria-label={t("guild.rankLevel", { level: rank.level })}
                  label={t("guild.rankLevel", { level: rank.level })}
                  value={rankNames[rank.level] ?? ""}
                  maxLength={GUILD_LIMITS.maxRankNameLength}
                  onChange={(event) =>
                    setRankNames((current) => ({
                      ...current,
                      [rank.level]: event.target.value,
                    }))
                  }
                  className="min-w-0 flex-1"
                />
                <Button size="sm" type="submit" disabled={pending}>
                  {t("guild.save")}
                </Button>
              </form>
            ))}
          </div>
          <div className="ui-divider" aria-hidden />
          <div className="flex items-end gap-2">
            <Dropdown
              ariaLabel={t("guild.passLeadership")}
              label={t("guild.passLeadership")}
              value={heirId}
              options={otherMembers.map((member) => ({
                value: member.characterId,
                label: member.name,
              }))}
              onChange={setHeirId}
              disabled={otherMembers.length === 0}
              className="min-w-0 flex-1"
            />
            <Button
              disabled={pending || heirId.length === 0}
              onClick={() => onPassLeadership(heirId)}
            >
              {t("guild.pass")}
            </Button>
          </div>
          <div className="ui-divider" aria-hidden />
          {confirmingDisband ? (
            <div className="flex items-center gap-3 rounded-md border border-ui-accent/40 bg-black/30 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm text-ui-text">
                {t("guild.disbandConfirm")}
              </span>
              <Button
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={onDisband}
              >
                {t("guild.disband")}
              </Button>
              <Button size="sm" onClick={() => setConfirmingDisband(false)}>
                {t("guild.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              variant="danger"
              className="self-start"
              onClick={() => setConfirmingDisband(true)}
            >
              {t("guild.disband")}
            </Button>
          )}
        </>
      ) : (
        <Button
          variant="danger"
          className="self-start"
          disabled={pending}
          onClick={onLeave}
        >
          {t("guild.leave")}
        </Button>
      )}
    </section>
  );
}
