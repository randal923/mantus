import { CUSTOM_ITEM_APPEARANCES, type CustomItemTint } from "@tibia/protocol";

const TINTS: ReadonlyMap<number, CustomItemTint> = new Map(
  CUSTOM_ITEM_APPEARANCES.flatMap((entry) =>
    entry.tint === undefined ? [] : [[entry.typeId, entry.tint] as const],
  ),
);

/** The recolour a server-added item type asks for, if it asks for one. */
export function getItemTint(clientId?: number): CustomItemTint | undefined {
  return clientId === undefined ? undefined : TINTS.get(clientId);
}
