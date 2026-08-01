"use client";

import type { WikiItem } from "../../lib/wiki/WikiItem";
import { HuntItemTile } from "./HuntItemTile";

const EQUIPMENT_SLOTS = [
  "head",
  "neck",
  "body",
  "rightHand",
  "leftHand",
  "leg",
  "finger",
  "feet",
  "ammo",
  "backpack",
] as const;

interface HuntEquipmentGridProps {
  equipment: Readonly<Record<string, string>>;
  itemsByName: ReadonlyMap<string, WikiItem>;
}

export function HuntEquipmentGrid({
  equipment,
  itemsByName,
}: HuntEquipmentGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {EQUIPMENT_SLOTS.map((slot) => {
        const name = equipment[slot] ?? "";
        return (
          <div key={slot} className="flex min-w-0 flex-col items-center gap-1">
            {name ? (
              <HuntItemTile name={name} itemsByName={itemsByName} compact />
            ) : (
              <span className="ui-panel-inset block size-12 rounded-sm border border-ui-stone-light/10 bg-black/20" />
            )}
            <span className="max-w-full truncate text-center text-[10px] tracking-wide text-ui-muted uppercase">
              {slot.replace(/([A-Z])/g, " $1")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
