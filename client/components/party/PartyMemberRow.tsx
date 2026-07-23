import type { PartyMemberEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface PartyMemberRowProps {
  member: PartyMemberEntry;
  isOwn: boolean;
  sharedExpActive: boolean;
  showLeaderControls: boolean;
  onKick?: (targetPlayerId: string) => void;
  onPassLeadership?: (targetPlayerId: string) => void;
}

export function PartyMemberRow({
  member,
  isOwn,
  sharedExpActive,
  showLeaderControls,
  onKick,
  onPassLeadership,
}: PartyMemberRowProps) {
  const { t } = useAppTranslation();
  return (
    <li className="min-w-0 px-1 py-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1.5">
          {member.isLeader && (
            <span
              title={t("party.leader")}
              aria-label={t("party.leader")}
              className="h-2 w-2 shrink-0 rotate-45 bg-ui-gold"
            />
          )}
          {sharedExpActive && (
            <span
              title={
                member.eligibleForSharedExp
                  ? t("party.eligible")
                  : t("party.notEligible")
              }
              aria-label={
                member.eligibleForSharedExp
                  ? t("party.eligible")
                  : t("party.notEligible")
              }
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                member.eligibleForSharedExp ? "bg-green-500" : "bg-zinc-500"
              }`}
            />
          )}
          <span
            className={`truncate ${isOwn ? "text-ui-text-bright" : "text-ui-text"}`}
          >
            {member.name}
          </span>
        </span>
        <span className="shrink-0 text-ui-muted">
          {t("party.level", { level: member.level })}
        </span>
      </div>
      <progress
        aria-label={t("party.healthOf", { name: member.name })}
        className="h-1 w-full accent-green-600"
        max={100}
        value={member.healthPercent ?? 0}
      />
      <progress
        aria-label={t("party.manaOf", { name: member.name })}
        className="h-1 w-full accent-blue-600"
        max={100}
        value={member.manaPercent ?? 0}
      />
      {showLeaderControls && !member.isLeader && (
        <div className="mt-1 flex gap-1.5">
          <Button size="sm" onClick={() => onKick?.(member.id)}>
            {t("party.kick")}
          </Button>
          <Button size="sm" onClick={() => onPassLeadership?.(member.id)}>
            {t("party.passLeadership")}
          </Button>
        </div>
      )}
    </li>
  );
}
