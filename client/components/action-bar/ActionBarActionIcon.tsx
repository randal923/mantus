import type {
  ActionBarAction,
  InventoryItem,
} from "@tibia/protocol";
import { getSpellIconArtwork } from "../../lib/combat/getSpellIconArtwork";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { SpellIcon } from "../spells/SpellIcon";

interface ActionBarActionIconProps {
  readonly action: ActionBarAction | null;
  readonly items: ReadonlyArray<InventoryItem>;
}

export function ActionBarActionIcon({
  action,
  items,
}: ActionBarActionIconProps) {
  if (!action) {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center text-lg text-ui-muted">
        +
      </span>
    );
  }
  if (action.kind === "text") {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-ui-gold/25 bg-black/35 font-display text-xs text-ui-gold">
        TXT
      </span>
    );
  }
  if (action.kind === "spell") {
    const artwork = getSpellIconArtwork(action.spellId);
    return artwork ? (
      <SpellIcon {...artwork} />
    ) : (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-ui-stone-light/20 bg-black/35 text-ui-muted">
        ?
      </span>
    );
  }
  const item = items.find((candidate) => candidate.typeId === action.itemTypeId);
  return item ? (
    <span className="flex size-11 shrink-0 items-center justify-center">
      <SpriteIcon spriteId={item.spriteId} scale={1.25} />
    </span>
  ) : (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-ui-stone-light/20 bg-black/35 text-ui-muted">
      ?
    </span>
  );
}
