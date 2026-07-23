"use client";

import { useMemo, useState } from "react";
import type { HouseListMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";

interface HouseBrowserSectionProps {
  list: HouseListMessage | null;
  pending: boolean;
  onBrowse: (townId?: number, page?: number) => void;
  onOpenHouse: (houseId: number) => void;
}

const ALL_TOWNS = "all";

/** Public town browser over the paged house-list projection. */
export function HouseBrowserSection({
  list,
  pending,
  onBrowse,
  onOpenHouse,
}: HouseBrowserSectionProps) {
  const { t, i18n } = useAppTranslation();
  const [town, setTown] = useState<string>(ALL_TOWNS);
  const townOptions = useMemo(() => {
    return [
      { value: ALL_TOWNS, label: t("house.allTowns") },
      ...(list?.towns ?? [])
        .map(({ townId, townName }) => ({
          value: String(townId),
          label: townName ?? String(townId),
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    ];
  }, [list, t]);
  const townId = town === ALL_TOWNS ? undefined : Number(town);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <Dropdown
          ariaLabel={t("house.townFilter")}
          label={t("house.townFilter")}
          value={town}
          options={townOptions}
          onChange={(value) => {
            setTown(value);
            onBrowse(value === ALL_TOWNS ? undefined : Number(value), 0);
          }}
        />
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => onBrowse(townId, list?.page ?? 0)}
        >
          {t("house.refresh")}
        </Button>
      </div>
      {!list || list.entries.length === 0 ? (
        <p className="text-sm text-ui-muted">{t("house.noHouses")}</p>
      ) : (
        <div className="max-h-72 overflow-y-auto ui-scrollbar">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="font-display text-xs tracking-widest text-ui-gold uppercase">
                <th className="py-1 pr-2">{t("house.nameColumn")}</th>
                <th className="py-1 pr-2">{t("house.town")}</th>
                <th className="py-1 pr-2">{t("house.size")}</th>
                <th className="py-1 pr-2">{t("house.rent")}</th>
                <th className="py-1 pr-2">{t("house.owner")}</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {list.entries.map((entry) => (
                <tr key={entry.houseId} className="border-t border-white/5">
                  <td className="py-1 pr-2 text-ui-text-bright">
                    {entry.name}
                    {entry.guildhall && (
                      <span className="ml-1 text-xs text-ui-gold uppercase">
                        {t("house.guildhall")}
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    {entry.townName ?? entry.townId}
                  </td>
                  <td className="py-1 pr-2">
                    {t("house.sqm", { count: entry.size })}
                  </td>
                  <td className="py-1 pr-2">
                    {entry.rent.toLocaleString(i18n.language)}
                  </td>
                  <td className="py-1 pr-2">
                    {entry.ownerName ?? t("house.unowned")}
                  </td>
                  <td className="py-1 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => onOpenHouse(entry.houseId)}
                    >
                      {t("house.view")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
