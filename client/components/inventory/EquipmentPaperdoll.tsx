import type { Equipment, EquipmentSlotId } from "./inventoryTypes";
import { ItemSlot } from "./ItemSlot";

/** Ghost sprites hinting what each empty slot accepts. */
const SLOT_HINT_SPRITES: Record<EquipmentSlotId, number> = {
  helmet: 428,
  amulet: 3810,
  backpack: 185,
  armor: 3829,
  weapon: 114,
  shield: 1986,
  legs: 3830,
  boots: 438,
  ring: 3816,
  ammo: 884,
};

/** Classic Tibia 10-slot layout, column by column. */
const SLOT_GRID: (EquipmentSlotId | null)[][] = [
  ["amulet", "weapon", "ring", null],
  ["helmet", "armor", "legs", "boots"],
  ["backpack", "shield", "ammo", null],
];

interface EquipmentPaperdollProps {
  equipment: Equipment;
}

/** The classic Tibia equipment cross: helmet/armor/legs/boots center column. */
export function EquipmentPaperdoll({ equipment }: EquipmentPaperdollProps) {
  return (
    <div className="flex justify-center gap-2">
      {SLOT_GRID.map((column, i) => (
        <div key={i} className={`flex flex-col gap-2 ${i !== 1 ? "pt-10" : ""}`}>
          {column.map(
            (slot) =>
              slot && (
                <ItemSlot
                  key={slot}
                  item={equipment[slot]}
                  placeholderSpriteId={SLOT_HINT_SPRITES[slot]}
                />
              )
          )}
        </div>
      ))}
    </div>
  );
}
