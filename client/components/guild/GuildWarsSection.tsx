"use client";

import { useState } from "react";
import { GUILD_LIMITS, type GuildWarEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface GuildWarsSectionProps {
  wars: ReadonlyArray<GuildWarEntry>;
  isLeader: boolean;
  pending: boolean;
  onDeclareWar: (targetGuildName: string, fragLimit: number) => void;
  onRespondWar: (warId: string, accept: boolean) => void;
  onEndWar: (warId: string) => void;
}

/** War list with scores plus leader-only declare/accept/reject/end controls. */
export function GuildWarsSection({
  wars,
  isLeader,
  pending,
  onDeclareWar,
  onRespondWar,
  onEndWar,
}: GuildWarsSectionProps) {
  const { t } = useAppTranslation();
  const [targetGuildName, setTargetGuildName] = useState("");
  const [fragLimit, setFragLimit] = useState("10");

  return (
    <section aria-label={t("guild.warsTitle")} className="flex flex-col gap-3">
      <h3 className="font-display text-sm tracking-widest text-ui-gold uppercase">
        {t("guild.warsTitle")}
      </h3>
      {isLeader && (
        <form
          className="flex max-w-lg items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = targetGuildName.trim();
            const limit = Number(fragLimit);
            if (name.length < GUILD_LIMITS.minNameLength) return;
            if (!Number.isInteger(limit) || limit < 1) return;
            onDeclareWar(name, Math.min(limit, GUILD_LIMITS.maxFragLimit));
            setTargetGuildName("");
          }}
        >
          <Input
            label={t("guild.warTarget")}
            aria-label={t("guild.warTarget")}
            placeholder={t("guild.warTargetPlaceholder")}
            value={targetGuildName}
            maxLength={GUILD_LIMITS.maxNameLength}
            onChange={(event) => setTargetGuildName(event.target.value)}
            className="min-w-0 flex-1"
          />
          <Input
            label={t("guild.fragLimit")}
            aria-label={t("guild.fragLimit")}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={String(GUILD_LIMITS.maxFragLimit).length}
            value={fragLimit}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (/^\d*$/.test(next)) setFragLimit(next);
            }}
            className="w-28"
          />
          <Button variant="danger" type="submit" disabled={pending}>
            {t("guild.declareWar")}
          </Button>
        </form>
      )}
      {wars.length === 0 ? (
        <p className="text-sm text-ui-muted">{t("guild.noWars")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {wars.map((war) => (
            <li
              key={war.warId}
              className="flex items-center gap-3 rounded-md border border-ui-stone-light/10 bg-black/20 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-ui-text-bright">
                {war.enemyGuildName}
              </span>
              <span className="shrink-0 font-display text-sm tracking-wider text-ui-text">
                {t("guild.warScore", {
                  mine: war.myKills,
                  theirs: war.enemyKills,
                  limit: war.fragLimit,
                })}
              </span>
              <span className="w-20 shrink-0 text-center text-xs tracking-widest text-ui-muted uppercase">
                {t(`guild.warStatus.${war.status}`)}
              </span>
              {isLeader && war.status === "pending" && !war.initiatedByUs && (
                <span className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={pending}
                    onClick={() => onRespondWar(war.warId, true)}
                  >
                    {t("guild.accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => onRespondWar(war.warId, false)}
                  >
                    {t("guild.reject")}
                  </Button>
                </span>
              )}
              {isLeader &&
                (war.status === "active" ||
                  (war.status === "pending" && war.initiatedByUs)) && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => onEndWar(war.warId)}
                  >
                    {war.status === "active"
                      ? t("guild.surrender")
                      : t("guild.withdraw")}
                  </Button>
                )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
