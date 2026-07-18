import type { Player } from "../Player";
import type { ShopEntry } from "./ShopCatalog";

export function isShopEntryAvailable(player: Player, entry: ShopEntry): boolean {
  if (entry.minimumLevel !== undefined && player.level < entry.minimumLevel) {
    return false;
  }
  if (entry.vocations && !entry.vocations.includes(player.vocation)) {
    return false;
  }
  return (
    !entry.availability ||
    entry.availability.every(
      (rule) => player.storageValue(rule.key) >= rule.value,
    )
  );
}
