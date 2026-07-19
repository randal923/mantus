import { useEffect, useState } from "react";
import type { OwnSkullState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatSkullRemaining } from "../../lib/pvp/formatSkullRemaining";

const SKULL_DOT_CLASSES: Record<OwnSkullState["kind"], string> = {
  white: "border-black bg-gray-100",
  red: "border-black bg-red-600",
  black: "border-gray-300 bg-black",
};

interface OwnSkullIndicatorProps {
  skull: OwnSkullState;
}

/**
 * HUD projection of the session player's own persistent skull with a local
 * countdown. Display only — the server enforces every skull consequence.
 */
export function OwnSkullIndicator({ skull }: OwnSkullIndicatorProps) {
  const { t } = useAppTranslation();
  const [tracked, setTracked] = useState({
    skull,
    remainingMs: skull.remainingMs,
  });
  // Render-time state adjustment: re-anchor the countdown whenever the
  // server sends a fresh projection.
  if (tracked.skull !== skull) {
    setTracked({ skull, remainingMs: skull.remainingMs });
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setTracked((current) =>
        current.remainingMs === null
          ? current
          : {
              ...current,
              remainingMs: Math.max(0, current.remainingMs - 1_000),
            },
      );
    }, 1_000);
    return () => clearInterval(timer);
  }, []);

  const remainingMs = tracked.remainingMs;

  return (
    <div
      aria-label={t("pvp.ownSkull")}
      className="ui-panel-frame pointer-events-auto flex items-center gap-2 px-2 py-1.5"
    >
      <span
        aria-hidden
        className={`size-3 rounded-full border ${SKULL_DOT_CLASSES[skull.kind]}`}
      />
      <span className="font-display text-sm text-ui-text-bright">
        {t(`pvp.skull.${skull.kind}`)}
      </span>
      {remainingMs !== null && (
        <span className="font-tibia text-sm text-ui-muted">
          {formatSkullRemaining(remainingMs)}
        </span>
      )}
    </div>
  );
}
