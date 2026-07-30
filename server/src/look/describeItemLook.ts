import type { ItemType } from "../item/ItemType";
import { imbuementLookLine } from "./imbuementLookLine";
import { itemLookSegments } from "./itemLookSegments";
import { itemNameDescription } from "./itemNameDescription";
import { itemWieldInfo } from "./itemWieldInfo";
import { weightLookDescription } from "./weightLookDescription";

/**
 * Live state of the looked-at instance. `attributes` being present is what
 * marks "there is a real instance here" (Canary's `item != nullptr`), even when
 * the bag is empty; a bare catalog look passes nothing.
 */
export interface ItemLookState {
  readonly count?: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

function readableLine(
  type: ItemType,
  attributes: Readonly<Record<string, unknown>> | undefined,
  distance: number,
): string {
  if (distance > 4) return "You are too far away to read it";
  const text = attributes?.text;
  if (typeof text !== "string" || text.length === 0) {
    return "Nothing is written on it.";
  }
  const writer = attributes?.writer;
  return typeof writer === "string" && writer
    ? `${writer} wrote: ${text}`
    : `You read: ${text}`;
}

/**
 * Canary `Item::getDescription` for the types our pinned catalog models: the
 * name, one parenthesised stat group, charge/readable suffixes, the wield
 * requirement, imbuement and classification lines, and — only for a looker
 * standing next to it — weight and flavour text. The caller prefixes
 * "You see ", exactly as Canary's `playerOnLook` callback does.
 */
export function describeItemLook(
  type: ItemType,
  distance: number,
  state: ItemLookState = {},
): string {
  const count = state.count ?? 1;
  const attributes = state.attributes;
  const segments = itemLookSegments(type);
  let head = itemNameDescription(type, count);
  if (segments.length > 0) head += ` (${segments.join(", ")})`;
  if (type.charges !== undefined) {
    head += ` that has ${type.charges} charge${type.charges === 1 ? "" : "s"} left`;
  }

  const lines: string[] = [];
  if (type.text?.allowDistanceRead) {
    lines.push(`${head}.`, readableLine(type, attributes, distance));
  } else {
    lines.push(`${head}.`);
  }

  const wieldInfo = itemWieldInfo(type);
  if (wieldInfo) lines.push(wieldInfo);

  if (attributes) {
    const imbuements = imbuementLookLine(type, attributes);
    if (imbuements) lines.push(imbuements);
    if (type.classification !== undefined && type.classification >= 1) {
      const tier = attributes.tier;
      const shown = typeof tier === "number" && tier > 0 ? Math.min(10, tier) : 0;
      lines.push(`Classification: ${type.classification} Tier: ${shown}.`);
    }
  }

  if (distance <= 1 && type.pickupable && type.weight !== 0) {
    lines.push(weightLookDescription(type, count));
  }

  // A row-level description (a decoration kit naming its furniture) beats the
  // type's own text, which Canary only shows to an adjacent looker.
  const special = attributes?.description;
  if (typeof special === "string" && special) lines.push(special);
  else if (distance <= 1 && type.description) lines.push(type.description);

  return lines.join("\n");
}
