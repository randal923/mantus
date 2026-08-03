"use client";

import type { TrackedEquipment } from "../../lib/imbuement/collectTrackedEquipment";
import type { ImbuementBurnClock } from "../../hooks/useImbuementBurnClock";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { ImbuementTrackerSlot } from "./ImbuementTrackerSlot";

interface ImbuementTrackerRowProps {
  readonly entry: TrackedEquipment;
  readonly clock: ImbuementBurnClock;
}

/**
 * One equipped piece: its icon, then a slot per imbuement the type can hold.
 * Empty slots keep their place so the row shows what the piece could take,
 * which is what OTClient's tracker draws with its inactive-slot placeholder.
 */
export function ImbuementTrackerRow({ entry, clock }: ImbuementTrackerRowProps) {
  const bySlot = new Map(entry.imbuements.map((it) => [it.slot, it]));

  return (
    <li className="flex items-center gap-1.5 rounded-sm border border-ui-stone-light/10 bg-black/25 px-2 py-1.5">
      <span className="flex size-8 shrink-0 items-center justify-center">
        <SpriteIcon
          spriteId={entry.item.spriteId}
          clientId={entry.item.clientId}
          scale={1}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-ui-muted capitalize">
        {entry.item.name}
      </span>
      <span className="flex shrink-0 gap-1">
        {Array.from({ length: entry.slotCount }, (_unused, slot) => {
          const imbuement = bySlot.get(slot);
          if (!imbuement) {
            return <ImbuementTrackerSlot key={slot} imbuement={null} />;
          }
          const burned = imbuement.aggressive
            ? clock.aggressiveSeconds
            : clock.passiveSeconds;
          return (
            <ImbuementTrackerSlot
              key={slot}
              imbuement={{
                name: imbuement.name,
                iconId: imbuement.iconId,
                remainingSeconds: Math.max(
                  0,
                  imbuement.remainingSeconds - burned,
                ),
              }}
            />
          );
        })}
      </span>
    </li>
  );
}
