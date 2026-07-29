/**
 * Canary's offer descriptions are written in the official client's markup:
 * a line beginning with `{character}` or `{storeinbox}` renders as an icon
 * plus a fixed caption.
 *
 * The icons are OTClient's own `store-icons-inline.png`, sliced by
 * tools/importOtclientStoreAssets.mjs; the captions are transcribed from
 * `modules/game_store/game_store.lua`'s `STORE_ICON_TAGS`, so a description
 * reads the same here as it does in the real client.
 *
 * Tags with no icon of ours — the hireling and house ones we do not sell —
 * simply fall through and are dropped by the renderer.
 */
export interface StoreDescriptionTag {
  /** File under /assets/store/tags, without the extension. */
  readonly icon: string;
  /** The caption the official client substitutes for a bare tag. */
  readonly caption: string;
}

export const STORE_DESCRIPTION_TAGS: Readonly<
  Record<string, StoreDescriptionTag>
> = {
  info: { icon: "info", caption: "" },
  character: {
    icon: "character",
    caption: "only usable by purchasing character",
  },
  charactericon: { icon: "character", caption: "" },
  usablebyall: {
    icon: "usablebyall",
    caption: "can be used by all characters on the account",
  },
  usablebyallicon: { icon: "usablebyall", caption: "" },
  box: {
    icon: "box",
    caption:
      "comes in a box which can only be unwrapped by purchasing character",
  },
  boxicon: { icon: "box", caption: "" },
  storeinbox: {
    icon: "storeinbox",
    caption:
      "will be sent to your Store inbox and can only be stored there and in depot box",
  },
  storeinboxicon: { icon: "storeinbox", caption: "" },
  house: {
    icon: "house",
    caption:
      "can only be unwrapped in a house owned by the purchasing character",
  },
  houseicon: { icon: "house", caption: "" },
  once: { icon: "once", caption: "can only be purchased once" },
  onceicon: { icon: "once", caption: "" },
  backtoinbox: {
    icon: "backtoinbox",
    caption:
      "will be wrapped back and sent to inbox if the purchasing character is no longer the house owner",
  },
  backtoinboxicon: { icon: "backtoinbox", caption: "" },
  vocationlevelcheck: {
    icon: "vocationlevelcheck",
    caption:
      "only buyable if fitting vocation and level of purchasing character",
  },
  vocationlevelcheckicon: { icon: "vocationlevelcheck", caption: "" },
  speedboost: {
    icon: "speedboost",
    caption: "provides character with a speed boost",
  },
  speedboosticon: { icon: "speedboost", caption: "" },
  activated: { icon: "activated", caption: "activated at purchase" },
  activatedicon: { icon: "activated", caption: "" },
  battlesign: {
    icon: "battlesign",
    caption:
      "cannot be purchased by characters with protection zone block or battle sign",
  },
  battlesignicon: { icon: "battlesign", caption: "" },
  capacity: {
    icon: "capacity",
    caption: "cannot be purchased if capacity is exceeded",
  },
  capacityicon: { icon: "capacity", caption: "" },
  use: { icon: "use", caption: "can be used" },
  useicon: { icon: "use", caption: "" },
  transferableprice: {
    icon: "transferableprice",
    caption: "can be purchased with transferable Mantus Coins",
  },
  transferablepriceicon: { icon: "transferableprice", caption: "" },
};
