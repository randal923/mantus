import type { Item } from "../Item";
import type { ItemCatalog } from "../ItemCatalog";
import type { CarriedPlan } from "./CarriedPlan";

const MAX_ATTRIBUTE_BYTES = 4_096;

export function planWriteText(input: {
  readonly characterId: string;
  readonly catalog: ItemCatalog;
  readonly items: ReadonlyArray<Item>;
  readonly itemId: string;
  readonly expectedVersion: number;
  readonly text: string;
}): CarriedPlan | null {
  const { characterId, catalog, items, text } = input;
  const item = items.find((candidate) => candidate.id === input.itemId);
  if (!item || item.version !== input.expectedVersion) return null;
  const type = catalog.require(item.typeId);
  if (!type.text?.writeable) return null;
  const attributes = { ...item.attributes, text };
  if (
    text.length > type.text.maxLength ||
    Buffer.byteLength(JSON.stringify(attributes)) > MAX_ATTRIBUTE_BYTES
  ) {
    return null;
  }
  const after: Item = { ...item, attributes, version: item.version + 1 };
  const previous = item.attributes.text;
  return {
    mutation: { before: item, after: [after] },
    persist: {
      characterId,
      rowOps: [{ kind: "write", expectedVersion: item.version, item: after }],
      audits: [
        {
          kind: "written",
          itemId: item.id,
          previousLength: typeof previous === "string" ? previous.length : 0,
          length: text.length,
        },
      ],
    },
  };
}
