"use client";

import { BOOSTED_RULES, type BoostedStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PreyCreatureSprite } from "../prey/PreyCreatureSprite";

interface BoostedTodaySectionProps {
  boosted: BoostedStateMessage | null;
  /** Smaller sprites and a single row for the bosstiary tab header. */
  compact?: boolean;
}

/** Today's boosted creature and boss, as the server announced them. */
export function BoostedTodaySection({
  boosted,
  compact = false,
}: BoostedTodaySectionProps) {
  const { t } = useAppTranslation();
  if (!boosted || (!boosted.creature && !boosted.boss)) return null;
  const fit = compact ? 40 : 64;

  return (
    <section
      aria-label={t("boosted.title")}
      className="ui-panel-inset rounded-sm border border-ui-gold/25 p-3"
    >
      <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
        {t("boosted.title")}
      </h4>
      <div
        className={`mt-2 flex flex-wrap gap-x-6 gap-y-2 ${
          compact ? "items-center" : ""
        }`}
      >
        {boosted.creature && (
          <span className="flex min-w-0 items-center gap-3">
            <PreyCreatureSprite
              lookTypeId={boosted.creature.lookTypeId}
              fit={fit}
            />
            <span className="min-w-0">
              <span className="block text-xs tracking-widest text-ui-muted uppercase">
                {t("boosted.creature")}
              </span>
              <span className="block truncate text-sm text-ui-text-bright capitalize">
                {boosted.creature.name}
              </span>
              <span className="block text-xs text-ui-gold">
                {t("boosted.creatureBonus", {
                  multiplier: BOOSTED_RULES.creatureExperienceMultiplier,
                })}
              </span>
            </span>
          </span>
        )}
        {boosted.boss && (
          <span className="flex min-w-0 items-center gap-3">
            <PreyCreatureSprite
              lookTypeId={boosted.boss.lookTypeId}
              fit={fit}
            />
            <span className="min-w-0">
              <span className="block text-xs tracking-widest text-ui-muted uppercase">
                {t("boosted.boss")}
              </span>
              <span className="block truncate text-sm text-ui-text-bright capitalize">
                {boosted.boss.name}
              </span>
              <span className="block text-xs text-ui-gold">
                {t("boosted.bossBonus", {
                  multiplier: BOOSTED_RULES.bossKillBonus,
                })}
              </span>
            </span>
          </span>
        )}
      </div>
    </section>
  );
}
