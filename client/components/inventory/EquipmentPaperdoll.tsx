import type { Equipment, EquipmentSlotId } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemSlot } from "./ItemSlot";
import type { ItemDragSource } from "./ItemDragSource";

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
  onUnequip?: (item: NonNullable<Equipment[EquipmentSlotId]>, slot: EquipmentSlotId) => void;
  onDragStart?(source: ItemDragSource): void;
  onDragEnd?(): void;
  onDrop?(slot: EquipmentSlotId): void;
  onDropInBackpack?(): void;
}

export function EquipmentPaperdoll({
  equipment,
  onUnequip,
  onDragStart,
  onDragEnd,
  onDrop,
  onDropInBackpack,
}: EquipmentPaperdollProps) {
  const { t } = useAppTranslation();

  return (
    <section
      aria-label={t("inventory.equippedItems")}
      className="rounded-xl border border-ui-gold/10 bg-black/15 px-3 py-4 shadow-inner shadow-black/25"
    >
      <p className="mb-3 text-center font-display text-[10px] tracking-[0.22em] text-ui-muted uppercase">
        {t("inventory.equipped")}
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
                    onActivate={
                      slot !== "backpack" && equipment[slot] && onUnequip
                        ? () => onUnequip(equipment[slot]!, slot)
                        : undefined
                    }
                    onDragStart={
                      slot !== "backpack" && equipment[slot] && onDragStart
                        ? () =>
                            onDragStart({
                              kind: "owned",
                              item: equipment[slot]!,
                              location: { kind: "equipment", slot },
                            })
                        : undefined
                    }
                    onDragEnd={onDragEnd}
                    onDrop={
                      slot === "backpack" && equipment.backpack
                        ? onDropInBackpack
                        : onDrop
                        ? () => onDrop(slot)
                        : undefined
                    }
                  />
                ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
