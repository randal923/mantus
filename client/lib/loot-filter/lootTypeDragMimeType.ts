/**
 * Drag payload for a loot-filter tile: the item *type* id, not an item
 * instance. Its own mime type keeps these drags from being mistaken for
 * inventory drags, which carry an item uuid in `text/plain`.
 */
export const LOOT_TYPE_DRAG_MIME_TYPE = "application/x-tibia-loot-type";
