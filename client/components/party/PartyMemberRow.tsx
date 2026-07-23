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
  const healthPercent = member.healthPercent ?? 0;
  const manaPercent = member.manaPercent ?? 0;

  return (
    <li className="rounded-xl border border-ui-gold/10 bg-black/25 p-3 text-sm shadow-sm shadow-black/30">
      <div className="flex items-center gap-3">
        <span
          className={`relative flex size-12 shrink-0 items-center justify-center rounded-md border bg-ui-panel-deep/80 shadow-inner shadow-black/50 ${
            member.isLeader
              ? "border-ui-gold/40 text-ui-gold"
              : "border-ui-gold/20 text-ui-muted"
          }`}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0M4 4.5h3M17 4.5h3" />
          </svg>
          {member.isLeader && (
            <span
              title={t("party.leader")}
              aria-label={t("party.leader")}
              className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-sm border border-ui-gold/50 bg-ui-panel-deep text-ui-gold shadow-md shadow-black/50"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m4 8 4 4 4-7 4 7 4-4-2 10H6zM7 21h10" />
              </svg>
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p
              className={`truncate font-display font-semibold ${
                isOwn ? "text-ui-text-bright" : "text-ui-text"
              }`}
            >
              {member.name}
            </p>
            {isOwn && (
              <span className="shrink-0 rounded-sm border border-ui-gold/20 bg-ui-gold-deep/30 px-1.5 py-0.5 text-xs font-semibold text-ui-gold uppercase">
                {t("party.you")}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs tracking-wide text-ui-muted">
            {t("party.levelVocation", {
              level: member.level,
              vocation: t(`vocations.${member.vocation}.name`),
            })}
          </p>
        </div>
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
            className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${
              member.eligibleForSharedExp
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
              {member.eligibleForSharedExp ? (
                <path d="m5 12 4 4L19 6" />
              ) : (
                <path d="m7 7 10 10M17 7 7 17" />
              )}
            </svg>
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-8 text-xs font-semibold tracking-wide text-ui-muted uppercase">
            {t("party.healthShort")}
          </span>
          <div
            role="progressbar"
            aria-label={t("party.healthOf", { name: member.name })}
            aria-valuemin={0}
            aria-valuemax={100}
            {...(member.healthPercent === null
              ? { "aria-valuetext": t("party.statusUnavailable") }
              : { "aria-valuenow": healthPercent })}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/60"
          >
            <span
              aria-hidden
              className="block h-full rounded-full bg-emerald-500"
              style={{ width: `${healthPercent}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs tabular-nums text-ui-muted">
            {member.healthPercent === null ? "—" : `${healthPercent}%`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-xs font-semibold tracking-wide text-ui-muted uppercase">
            {t("party.manaShort")}
          </span>
          <div
            role="progressbar"
            aria-label={t("party.manaOf", { name: member.name })}
            aria-valuemin={0}
            aria-valuemax={100}
            {...(member.manaPercent === null
              ? { "aria-valuetext": t("party.statusUnavailable") }
              : { "aria-valuenow": manaPercent })}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/60"
          >
            <span
              aria-hidden
              className="block h-full rounded-full bg-sky-500"
              style={{ width: `${manaPercent}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs tabular-nums text-ui-muted">
            {member.manaPercent === null ? "—" : `${manaPercent}%`}
          </span>
        </div>
      </div>

      {showLeaderControls && !member.isLeader && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onKick?.(member.id)}
          >
            {t("party.kick")}
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onPassLeadership?.(member.id)}
          >
            {t("party.passLeadership")}
          </Button>
        </div>
      )}
    </li>
  );
}
