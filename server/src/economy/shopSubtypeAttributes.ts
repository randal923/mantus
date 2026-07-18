import type { ShopItemSubtype } from "./ShopStore";

export function shopSubtypeAttributes(
  subtype?: ShopItemSubtype,
): Readonly<Record<string, unknown>> {
  if (!subtype) return {};
  return subtype.kind === "charges"
    ? { charges: subtype.value }
    : { fluidType: subtype.value };
}
