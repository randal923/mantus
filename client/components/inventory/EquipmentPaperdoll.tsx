import type { Equipment, EquipmentSlotId } from "./inventoryTypes";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemSlot } from "./ItemSlot";
import { CustomArtSpriteIcon } from "./CustomArtSpriteIcon";
import { SpriteIcon } from "./SpriteIcon";
import { getCustomItemArt } from "../../lib/render/getCustomItemArt";
import type { ItemDragSource } from "./ItemDragSource";

/** The gear slots the paperdoll draws; the bound-items root is not one. */
type PaperdollSlotId = Exclude<EquipmentSlotId, "bound">;

const SLOT_HINT_SPRITES: Record<PaperdollSlotId, number> = {
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

const SLOT_GRID: (PaperdollSlotId | null)[][] = [
  ["amulet", "weapon", "ring", null],
  ["helmet", "armor", "legs", "boots"],
  ["backpack", "shield", "ammo", null],
];

/** Index of the column whose spacer the bound-items button replaces. */
const BACKPACK_COLUMN = 2;

interface EquipmentPaperdollProps {
  equipment: Equipment;
  onUnequip?: (item: NonNullable<Equipment[EquipmentSlotId]>, slot: EquipmentSlotId) => void;
  onDragStart?(source: ItemDragSource): void;
  onDragEnd?(): void;
  onDrop?(slot: EquipmentSlotId): void;
  onDropInBackpack?(): void;
  onOpenBackpack?(): void;
  onOpenBound?(): void;
  /** Whether the bound-items container is the window currently in view. */
  boundOpen?: boolean;
}

/**
 * The bound-items button draws the bound container's own trunk art (frame 0
 * closed, frame 1 open): shut at rest, open on hover and while the window is
 * in view. The item renders the same strip everywhere via getCustomItemArt.
 */
const BOUND_TRUNK_ART = getCustomItemArt(23_396);

export function EquipmentPaperdoll({
  equipment,
  onUnequip,
  onDragStart,
  onDragEnd,
  onDrop,
  onDropInBackpack,
  onOpenBackpack,
  onOpenBound,
  boundOpen = false,
}: EquipmentPaperdollProps) {
  const { t } = useAppTranslation();
  const bound = equipment.bound;

  return (
    <section
      aria-label={t("inventory.equippedItems")}
      className="rounded-xl border border-ui-gold/10 bg-black/15 px-3 py-4 shadow-inner shadow-black/25"
    >
      <p className="mb-3 text-center font-display text-xs tracking-[0.22em] text-ui-muted uppercase">
        {t("inventory.equipped")}
      </p>
      <div className="flex justify-center gap-2">
        {SLOT_GRID.map((column, i) => (
          <div
            key={i}
            className={`flex flex-col gap-2 ${
              i !== 1 && !(i === BACKPACK_COLUMN && bound) ? "pt-10" : ""
            }`}
          >
            {i === BACKPACK_COLUMN && bound && (
              <button
                type="button"
                title={t("inventory.boundItems")}
                aria-label={t("inventory.boundItems")}
                // Containers open on right-click here, same as every slot
                // (ItemSlot routes onContextMenu to onActivate); the keyboard
                // keeps Enter/Space since a context gesture has no key.
                onContextMenu={(event) => {
                  event.preventDefault();
                  onOpenBound?.();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onOpenBound?.();
                }}
                className="group flex h-8 w-16 items-center justify-center overflow-hidden rounded-lg border border-ui-stone/35 bg-black/30 shadow-inner shadow-black/55 transition-[border-color,background-color] hover:border-ui-gold/40 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ui-gold/60 focus-visible:outline-none"
              >
                {BOUND_TRUNK_ART ? (
                  <>
                    <span
                      className={boundOpen ? "hidden" : "group-hover:hidden"}
                    >
                      <CustomArtSpriteIcon
                        art={BOUND_TRUNK_ART}
                        clientId={bound.clientId}
                        frame={0}
                        scale={1}
                      />
                    </span>
                    <span
                      className={
                        boundOpen ? "" : "hidden group-hover:inline-block"
                      }
                    >
                      <CustomArtSpriteIcon
                        art={BOUND_TRUNK_ART}
                        clientId={bound.clientId}
                        frame={1}
                        scale={1}
                      />
                    </span>
                  </>
                ) : (
                  <SpriteIcon
                    spriteId={bound.spriteId}
                    clientId={bound.clientId}
                    scale={1}
                  />
                )}
              </button>
            )}
            {column.map(
              (slot) =>
                slot && (
                  <ItemSlot
                    key={slot}
                    item={equipment[slot]}
                    mirrorOf={
                      slot === "shield" && equipment.weapon?.twoHanded
                        ? equipment.weapon
                        : undefined
                    }
                    placeholderSpriteId={SLOT_HINT_SPRITES[slot]}
                    onActivate={
                      slot === "backpack" && equipment.backpack
                        ? onOpenBackpack
                        : equipment[slot] && onUnequip
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
