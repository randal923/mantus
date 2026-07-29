import { STORE_DESCRIPTION_TAGS } from "../../components/store/storeDescriptionTags";

export interface StoreDescriptionLine {
  /** Icon file under /assets/store/tags, or null for a plain line. */
  readonly icon: string | null;
  readonly text: string;
}

const LIMIT_TAG = /^\{limit\|(\d+)\}/;
const TAG = /^\{([a-z]+)\}/i;

/**
 * Splits an offer description into the icon-and-text lines the official
 * client renders. A leading `{tag}` becomes that tag's icon plus its caption
 * (or the line's own text, when it has some); anything else is a plain line.
 *
 * `{limit|N}` is Canary's parameterised tag for per-character caps.
 */
export function parseStoreDescription(
  description: string,
): StoreDescriptionLine[] {
  return description.split("\n").flatMap((raw): StoreDescriptionLine[] => {
    const line = raw.trim();
    if (line.length === 0) return [];

    const limit = LIMIT_TAG.exec(line);
    if (limit) {
      const rest = line.slice(limit[0].length).trim();
      return [
        {
          icon: "once",
          text:
            rest.length > 0
              ? rest
              : `maximum amount that can be owned by character: ${limit[1]}`,
        },
      ];
    }

    const tag = TAG.exec(line);
    if (!tag) return [{ icon: null, text: line }];

    const known = STORE_DESCRIPTION_TAGS[tag[1]!.toLowerCase()];
    const rest = line.slice(tag[0].length).trim();
    // An unknown tag is markup we do not render; keep the text, drop the tag.
    if (!known) return rest.length > 0 ? [{ icon: null, text: rest }] : [];
    const text = rest.length > 0 ? rest : known.caption;
    return text.length > 0 || known.caption.length > 0
      ? [{ icon: known.icon, text }]
      : [];
  });
}
