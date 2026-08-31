/**
 * Canary's offer descriptions are written in the official client's markup:
 * a line beginning with `{character}` or `{storeinbox}` renders as an icon
 * plus a fixed caption.
 *
 * The icons are OTClient's own `store-icons-inline.png`, sliced by
 * tools/importOtclientStoreAssets.mjs; the captions live in the locale files
 * under `store.tags.<key>` (transcribed from `modules/game_store/game_store.lua`'s
 * `STORE_ICON_TAGS` for English), so a description reads the same here as it
 * does in the real client — in the player's language.
 *
 * Tags with no icon of ours — the hireling and house ones we do not sell —
 * simply fall through and are dropped by the renderer.
 */
export interface StoreDescriptionTag {
  /** File under /assets/store/tags, without the extension. */
  readonly icon: string;
  /** Locale key under `store.tags`, or null for an icon-only tag. */
  readonly caption: string | null;
}

export const STORE_DESCRIPTION_TAGS: Readonly<
  Record<string, StoreDescriptionTag>
> = {
  info: { icon: "info", caption: null },
  character: { icon: "character", caption: "character" },
  charactericon: { icon: "character", caption: null },
  usablebyall: { icon: "usablebyall", caption: "usablebyall" },
  usablebyallicon: { icon: "usablebyall", caption: null },
  box: { icon: "box", caption: "box" },
  boxicon: { icon: "box", caption: null },
  storeinbox: { icon: "storeinbox", caption: "storeinbox" },
  storeinboxicon: { icon: "storeinbox", caption: null },
  house: { icon: "house", caption: "house" },
  houseicon: { icon: "house", caption: null },
  once: { icon: "once", caption: "once" },
  onceicon: { icon: "once", caption: null },
  backtoinbox: { icon: "backtoinbox", caption: "backtoinbox" },
  backtoinboxicon: { icon: "backtoinbox", caption: null },
  vocationlevelcheck: { icon: "vocationlevelcheck", caption: "vocationlevelcheck" },
  vocationlevelcheckicon: { icon: "vocationlevelcheck", caption: null },
  speedboost: { icon: "speedboost", caption: "speedboost" },
  speedboosticon: { icon: "speedboost", caption: null },
  activated: { icon: "activated", caption: "activated" },
  activatedicon: { icon: "activated", caption: null },
  battlesign: { icon: "battlesign", caption: "battlesign" },
  battlesignicon: { icon: "battlesign", caption: null },
  capacity: { icon: "capacity", caption: "capacity" },
  capacityicon: { icon: "capacity", caption: null },
  use: { icon: "use", caption: "use" },
  useicon: { icon: "use", caption: null },
  transferableprice: { icon: "transferableprice", caption: "transferableprice" },
  transferablepriceicon: { icon: "transferableprice", caption: null },
};
