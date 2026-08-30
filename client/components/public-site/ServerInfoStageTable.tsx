"use client";

import type { PublicStageRow } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";

/** One level-banded rate table (experience, skills or magic) of the world. */
export function ServerInfoStageTable({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: ReadonlyArray<PublicStageRow>;
}) {
  const { t } = useAppTranslation();

  return (
    <div className="border-t border-white/5 first:border-t-0 md:border-t-0 md:border-l md:first:border-l-0">
      <h3 className="border-b border-white/5 px-[1.125rem] py-3 font-display text-[0.6875rem] font-normal tracking-[0.22em] text-[#6e6a66] uppercase">
        {title}
      </h3>
      <dl className="divide-y divide-white/5">
        {rows.map((row) => (
          <div
            key={row.minLevel}
            className="flex items-center justify-between gap-4 px-5 py-2.5"
          >
            <dt className="text-sm text-ui-text">
              {row.maxLevel === null
                ? t("serverInfo.stageOpenBand", { min: row.minLevel })
                : t("serverInfo.stageBand", {
                    min: row.minLevel,
                    max: row.maxLevel,
                  })}
            </dt>
            <dd className="font-display text-sm font-semibold text-[#c9a06a]">
              {row.multiplier}x
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
