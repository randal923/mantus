import type { Equipment, EquipmentSlotId } from "./inventoryTypes";
import { ItemSlot } from "./ItemSlot";

const SLOT_HINT_SPRITES: Record<EquipmentSlotId, number> = {
  helmet: 7837,
  amulet: 7522,
  backpack: 7137,
  armor: 7843,
  weapon: 7734,
  shield: 7912,
  legs: 8141,
  boots: 8125,
  ring: 7545,
  ammo: 7946,
};

const SLOT_GRID: (EquipmentSlotId | null)[][] = [
  ["amulet", "weapon", "ring", null],
  ["helmet", "armor", "legs", "boots"],
  ["backpack", "shield", "ammo", null],
];

interface EquipmentPaperdollProps {
  equipment: Equipment;
}

export function EquipmentPaperdoll({ equipment }: EquipmentPaperdollProps) {
  return (
    <section
      aria-label="Equipped items"
      className="rounded-xl border border-ui-gold/10 bg-black/15 px-3 py-4 shadow-inner shadow-black/25"
    >
      <p className="mb-3 text-center font-display text-[10px] tracking-[0.22em] text-ui-muted uppercase">
        Equipped
      </p>
      <div className="flex justify-center gap-2">
        {SLOT_GRID.map((column, i) => (
          <div
            key={i}
            className={`flex flex-col gap-2 ${i !== 1 ? "pt-10" : ""}`}
          >
            {column.map(
              (slot) =>
                slot && (
                  <ItemSlot
                    key={slot}
                    item={equipment[slot]}
                    placeholderSpriteId={SLOT_HINT_SPRITES[slot]}
                  />
                ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
