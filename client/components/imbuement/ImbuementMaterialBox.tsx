"use client";

import type { ImbuementMaterial } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface ImbuementMaterialBoxProps {
  material: ImbuementMaterial;
  /** Sprite for the material's item type, resolved by the caller. */
  spriteId?: number;
}

/**
 * One astral source as Tibia's imbuing window shows it: the item sprite with
 * its required count, red while the player is short. `available` already
 * counts the stash, because applying spends from there too.
 */
export function ImbuementMaterialBox({
  material,
  spriteId,
}: ImbuementMaterialBoxProps) {
  const { t } = useAppTranslation();
  const covered = material.available >= material.count;
  const fromStash = material.stashAvailable > 0;

  return (
    <li
      className={`flex size-24 min-w-0 flex-col items-center justify-center gap-1 border bg-black/40 p-1 ${
        covered ? "border-ui-stone-light/20" : "border-ui-accent/50"
      }`}
      title={
        fromStash
          ? t("imbuement.materialFromStash", {
              name: material.name,
              stash: material.stashAvailable,
            })
          : material.name
      }
    >
      <span className="flex size-11 items-center justify-center">
        {spriteId !== undefined && (
          <SpriteIcon spriteId={spriteId} scale={1.25} />
        )}
      </span>
      <span
        className={`text-sm tabular-nums ${
          covered ? "text-ui-text-bright" : "text-ui-accent-light"
        }`}
      >
        {material.available}/{material.count}
      </span>
    </li>
  );
}
