import { randomUUID } from "node:crypto";
import { MAX_CONTAINER_CAPACITY } from "@tibia/protocol";
import { BOUND_CONTAINER_TYPE_ID } from "../item/boundContainerTypeId";
import { DECORATION_KIT_ITEM_ID } from "../item/decorationKitItemId";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";

/** The whole carried tree shares one row budget; see ownedItemsQuery. */
const MAX_CARRIED_ITEMS = 500;

/**
 * The memory-side twin of `deliverBoundItem`: places a purchased product into
 * free slots of the buyer's bound container using the live inventory snapshot
 * instead of locked rows. The persist later writes exactly these ids and
 * slots, so memory and database cannot disagree about where the purchase
 * landed. A character predating the bound-container backfill gets the root
 * planned here and created in the same persist transaction.
 */
export function planBoundItemDelivery(input: {
  readonly grant:
    | {
        readonly kind: "item" | "stackable";
        readonly itemTypeId: number;
        readonly count: number;
      }
    | {
        readonly kind: "charges";
        readonly itemTypeId: number;
        readonly charges: number;
      }
    | {
        readonly kind: "house-item";
        readonly itemTypeId: number;
        readonly count: number;
      };
  readonly catalog: ItemCatalog;
  readonly characterId: string;
  readonly carriedItems: ReadonlyArray<Item>;
  readonly requestKey: string;
}):
  | {
      readonly status: "planned";
      readonly createBoundRoot: boolean;
      readonly boundRootId: string;
      readonly boundRootItem?: Item;
      readonly items: ReadonlyArray<Item>;
      readonly rows: ReadonlyArray<{
        readonly id: string;
        readonly itemTypeId: number;
        readonly count: number;
        readonly attributes: Readonly<Record<string, unknown>>;
        readonly slot: number;
        readonly deliveryKey: string;
      }>;
    }
  | { readonly status: "inbox-full" | "failed" } {
  const { grant, catalog, carriedItems, requestKey } = input;
  const deliveredTypeId =
    grant.kind === "house-item" ? DECORATION_KIT_ITEM_ID : grant.itemTypeId;
  const type = catalog.require(deliveredTypeId);
  if (!type.pickupable) return { status: "failed" };

  const stacks =
    grant.kind === "charges"
      ? [{ count: 1, attributes: { charges: grant.charges } }]
      : grant.kind === "house-item"
        ? Array.from({ length: grant.count }, () => ({
            count: 1,
            attributes: {
              unwrapTo: grant.itemTypeId,
              description:
                "Unwrap it in your own house to create a " +
                `${catalog.require(grant.itemTypeId).name}.`,
            },
          }))
        : splitIntoStacks(grant.count, type.maxCount).map((count) => ({
            count,
            attributes: {},
          }));

  const existingRoot = carriedItems.find(
    (item) =>
      item.location.kind === "equipment" && item.location.slot === "bound",
  );
  const boundRootId = existingRoot?.id ?? randomUUID();
  const carriedRows = carriedItems.length + (existingRoot ? 0 : 1);
  if (carriedRows + stacks.length > MAX_CARRIED_ITEMS) {
    return { status: "inbox-full" };
  }

  const capacity =
    catalog.require(BOUND_CONTAINER_TYPE_ID).containerCapacity ??
    MAX_CONTAINER_CAPACITY;
  const usedSlots = new Set(
    carriedItems.flatMap((item) =>
      item.location.kind === "container" &&
      item.location.containerId === boundRootId
        ? [item.location.slot]
        : [],
    ),
  );
  const freeSlots: number[] = [];
  for (
    let slot = 0;
    slot < capacity && freeSlots.length < stacks.length;
    slot++
  ) {
    if (!usedSlots.has(slot)) freeSlots.push(slot);
  }
  if (freeSlots.length < stacks.length) return { status: "inbox-full" };

  const items: Item[] = [];
  const rows = stacks.map((stack, index) => {
    const id = randomUUID();
    const slot = freeSlots[index]!;
    const deliveryKey =
      stacks.length === 1 ? requestKey : `${requestKey}:${index}`;
    items.push({
      id,
      typeId: deliveredTypeId,
      count: stack.count,
      attributes: stack.attributes,
      version: 1,
      location: { kind: "container", containerId: boundRootId, slot },
    });
    return {
      id,
      itemTypeId: deliveredTypeId,
      count: stack.count,
      attributes: stack.attributes,
      slot,
      deliveryKey,
    };
  });

  return {
    status: "planned",
    createBoundRoot: existingRoot === undefined,
    boundRootId,
    ...(existingRoot === undefined
      ? {
          boundRootItem: {
            id: boundRootId,
            typeId: BOUND_CONTAINER_TYPE_ID,
            count: 1,
            attributes: {},
            version: 1,
            location: {
              kind: "equipment",
              characterId: input.characterId,
              slot: "bound",
            },
          } satisfies Item,
        }
      : {}),
    items,
    rows,
  };
}

function splitIntoStacks(count: number, maxCount: number): number[] {
  const perStack = Math.max(1, maxCount);
  const stacks: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    const size = Math.min(remaining, perStack);
    stacks.push(size);
    remaining -= size;
  }
  return stacks;
}
