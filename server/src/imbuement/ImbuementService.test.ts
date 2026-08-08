import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { DepotService } from "../depot/DepotService";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import type { ImbuementCatalog } from "./ImbuementCatalog";
import { ImbuementService } from "./ImbuementService";
import { MemoryImbuementStore } from "./MemoryImbuementStore";

const A = "00000000-0000-4000-8000-00000000000a";
const ITEM = "00000000-0000-4000-8000-0000000000e1";
const SHRINE_TYPE_ID = 24_964;
const SOURCE = 9_636;
const ARMOR_TYPE_ID = 900;
const BLANK_SCROLL = 51_442;
const FILLED_SCROLL = 51_739;

/** Basic Scorch: 25 fire source, 5000 gold, elemental-damage at level 1. */
function makeCatalog(scrollItemTypeId?: number): ImbuementCatalog {
  return {
    bases: new Map([
      [
        1,
        {
          id: 1,
          name: "Basic",
          priceGold: 5_000,
          protectionPriceGold: 10_000,
          successPercent: 90,
          removeCostGold: 15_000,
          durationSeconds: 72_000,
        },
      ],
    ]),
    categories: new Map([
      [
        "elemental-damage",
        {
          id: 0,
          slug: "elemental-damage",
          name: "Elemental Damage",
          aggressive: true,
        },
      ],
    ]),
    imbuements: new Map([
      [
        1,
        {
          id: 1,
          name: "Scorch",
          baseId: 1,
          categoryId: 0,
          categorySlug: "elemental-damage",
          iconId: 13,
          premium: false,
          description: "Converts 10% of the physical damage to fire damage.",
          effect: { kind: "damage", element: "fire", percent: 10 } as const,
          astralSources: [{ itemTypeId: SOURCE, count: 25 }],
          ...(scrollItemTypeId === undefined ? {} : { scrollItemTypeId }),
        },
      ],
    ]),
  };
}

function makeHarness(input: {
  carried?: number;
  stashed?: number;
  blankScrolls?: number;
  gold?: number;
  scrollItemTypeId?: number;
}) {
  const armor: Item = {
    id: ITEM,
    typeId: ARMOR_TYPE_ID,
    count: 1,
    attributes: {},
    version: 3,
    location: { kind: "equipment", characterId: A, slot: "armor" },
  };
  const items: Item[] = [armor];
  if (input.carried) {
    items.push({
      id: "00000000-0000-4000-8000-0000000000c1",
      typeId: SOURCE,
      count: input.carried,
      attributes: {},
      version: 1,
      location: { kind: "equipment", characterId: A, slot: "backpack" },
    });
  }
  const sent: ServerMessage[] = [];
  const session = {
    id: `session-${A}`,
    playerId: A,
    itemOperationPending: false,
    depotOperationPending: false,
    itemPersistsPending: 0,
    send: (message: ServerMessage) => sent.push(message),
  } as unknown as Session;
  const registry = {
    all: () => [session].values(),
    sessionFor: () => session,
  } as unknown as SessionRegistry;
  const world = {
    getPlayer: (id: string) =>
      id === A
        ? {
            position: { x: 10, y: 10, z: 7 },
            conditions: new Map(),
            isPremiumAt: () => true,
          }
        : undefined,
    getMapItems: () => [{ itemId: SHRINE_TYPE_ID }],
    isProtectionZone: () => false,
  } as unknown as World;
  const itemCatalog = {
    get: (typeId: number) =>
      typeId === ARMOR_TYPE_ID
        ? {
            id: ARMOR_TYPE_ID,
            name: "magic plate armor",
            imbuementSlots: 3,
            imbuementTypes: { "elemental-damage": 3 },
          }
        : typeId === SOURCE
          ? { id: SOURCE, name: "fiery heart" }
          : undefined,
  } as unknown as ItemCatalog;
  const itemHandler = {
    inventorySnapshot: () => ({ items, capacityMax: 400 }),
    applyCommittedMutation: () => {},
    trackExternalOperation: () => {},
    combatEquipment: () => [],
    applyWorldPlan: () => {},
  } as unknown as ItemIntentHandler;
  const stash = new Map<number, number>([
    ...(input.stashed ? ([[SOURCE, input.stashed]] as const) : []),
    ...(input.blankScrolls
      ? ([[BLANK_SCROLL, input.blankScrolls]] as const)
      : []),
  ]);
  const stashWrites: Array<ReadonlyArray<{ itemTypeId: number; count: number }>> =
    [];
  const depot = {
    stashCountOf: (_characterId: string, itemTypeId: number) =>
      stash.get(itemTypeId) ?? 0,
    setStashCounts: (
      _characterId: string,
      counts: ReadonlyArray<{ itemTypeId: number; count: number }>,
    ) => {
      stashWrites.push(counts);
      for (const entry of counts) stash.set(entry.itemTypeId, entry.count);
    },
  } as unknown as DepotService;
  const store = new MemoryImbuementStore();
  store.goldBalances.set(A, input.gold ?? 1_000_000);
  store.materialCounts.set(SOURCE, input.carried ?? 0);
  const service = new ImbuementService(
    world,
    registry,
    itemHandler,
    itemCatalog,
    depot,
    makeCatalog(input.scrollItemTypeId),
    store,
  );
  return {
    session,
    sent,
    store,
    service,
    stash,
    stashWrites,
    failures: () =>
      sent.filter((message) => message.type === "imbuement-action-failed"),
    async flush(now = 10_000) {
      for (let round = 0; round < 4; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

describe("ImbuementService apply", () => {
  it("spends carried sources first and only draws the stash shortfall", async () => {
    const harness = makeHarness({ carried: 10, stashed: 60 });
    harness.service.handleApply(
      harness.session,
      { type: "imbuement-apply", itemId: ITEM, slot: 0, imbuementId: 1 },
      1_000,
    );
    await harness.flush();

    const request = harness.store.requests[0];
    expect(request?.materials).toEqual([{ itemTypeId: SOURCE, count: 10 }]);
    expect(request?.stashOps).toEqual([{ itemTypeId: SOURCE, count: 45 }]);
    expect(harness.stash.get(SOURCE)).toBe(45);
  });

  it("denormalizes the category's aggressiveness onto the slot", async () => {
    const harness = makeHarness({ carried: 25 });
    harness.service.handleApply(
      harness.session,
      { type: "imbuement-apply", itemId: ITEM, slot: 0, imbuementId: 1 },
      1_000,
    );
    await harness.flush();

    // The tracker's countdown reads this to know the slot only burns in a
    // fight; item projections run without the imbuement catalog.
    expect(harness.store.requests[0]?.attributes.imbuements).toEqual([
      {
        slot: 0,
        imbuementId: 1,
        remainingSeconds: 72_000,
        name: "Basic Scorch",
        iconId: 13,
        aggressive: true,
      },
    ]);
  });

  it("counts the stash toward availability", async () => {
    const harness = makeHarness({ carried: 0, stashed: 25 });
    harness.service.handleApply(
      harness.session,
      { type: "imbuement-apply", itemId: ITEM, slot: 0, imbuementId: 1 },
      1_000,
    );
    await harness.flush();

    expect(harness.failures()).toEqual([]);
    expect(harness.store.requests).toHaveLength(1);
    expect(harness.stash.get(SOURCE)).toBe(0);
  });

  it("refuses when carried and stash together fall short", async () => {
    const harness = makeHarness({ carried: 5, stashed: 5 });
    harness.service.handleApply(
      harness.session,
      { type: "imbuement-apply", itemId: ITEM, slot: 0, imbuementId: 1 },
      1_000,
    );
    await harness.flush();

    expect(harness.store.requests).toEqual([]);
    expect(harness.failures()).toEqual([
      { type: "imbuement-action-failed", reason: "insufficient-materials" },
    ]);
    expect(harness.stash.get(SOURCE)).toBe(5);
  });

  it("lets only one of two racing applies spend the same stash sources", async () => {
    const harness = makeHarness({ carried: 0, stashed: 25 });
    const intent = {
      type: "imbuement-apply",
      itemId: ITEM,
      slot: 0,
      imbuementId: 1,
    } as const;
    // Both intents arrive before the first mutation resolves.
    harness.service.handleApply(harness.session, intent, 1_000);
    harness.service.handleApply(harness.session, intent, 2_000);
    await harness.flush();

    expect(harness.store.requests).toHaveLength(1);
    expect(harness.failures()).toEqual([
      { type: "imbuement-action-failed", reason: "rate-limited" },
    ]);
    expect(harness.stash.get(SOURCE)).toBe(0);
  });

  it("restores the stash reservation when the transaction does not commit", async () => {
    const harness = makeHarness({ carried: 0, stashed: 25, gold: 0 });
    harness.service.handleApply(
      harness.session,
      { type: "imbuement-apply", itemId: ITEM, slot: 0, imbuementId: 1 },
      1_000,
    );
    await harness.flush();

    expect(harness.failures()).toEqual([
      { type: "imbuement-action-failed", reason: "insufficient-gold" },
    ]);
    expect(harness.stash.get(SOURCE)).toBe(25);
  });

  it("refuses to open the window away from a shrine", () => {
    const harness = makeHarness({ carried: 25 });
    const world = harness.service as unknown as {
      world: { getMapItems: () => unknown[] };
    };
    world.world.getMapItems = () => [];
    harness.service.handleWindowGet(
      harness.session,
      { type: "imbuement-window-get", itemId: ITEM, mode: "item" },
      1_000,
    );

    expect(harness.failures()).toEqual([
      { type: "imbuement-action-failed", reason: "no-shrine" },
    ]);
  });
});

describe("ImbuementService scroll flow", () => {
  it("spends a blank scroll plus the sources and mints the filled scroll", async () => {
    const harness = makeHarness({
      carried: 25,
      blankScrolls: 1,
      scrollItemTypeId: FILLED_SCROLL,
    });
    harness.service.handleScrollCreate(
      harness.session,
      { type: "imbuement-scroll-create", imbuementId: 1 },
      1_000,
    );
    await harness.flush();

    const request = harness.store.requests[0];
    expect(request?.grants).toEqual([{ itemTypeId: FILLED_SCROLL, count: 1 }]);
    expect(request?.stashOps).toEqual([{ itemTypeId: BLANK_SCROLL, count: 0 }]);
    expect(request?.materials).toEqual([{ itemTypeId: SOURCE, count: 25 }]);
    expect(request?.itemId).toBeNull();
    expect(request?.auditEvent).toBe("imbuement-scroll-create");
  });

  it("refuses to forge a scroll with no blank scroll to spend", async () => {
    const harness = makeHarness({
      carried: 25,
      scrollItemTypeId: FILLED_SCROLL,
    });
    harness.service.handleScrollCreate(
      harness.session,
      { type: "imbuement-scroll-create", imbuementId: 1 },
      1_000,
    );
    await harness.flush();

    expect(harness.store.requests).toEqual([]);
    expect(harness.failures()).toEqual([
      { type: "imbuement-action-failed", reason: "no-blank-scroll" },
    ]);
  });
});

/** Decay sweep: an armor wearing one aggressive and one wall-clock imbuement. */
function makeDecayHarness(input: {
  premium: boolean;
  inProtectionZone: boolean;
}) {
  const armor: Item = {
    id: ITEM,
    typeId: ARMOR_TYPE_ID,
    count: 1,
    attributes: {
      imbuements: [
        {
          slot: 0,
          imbuementId: 1,
          remainingSeconds: 7_200,
          name: "Basic Scorch",
          aggressive: true,
        },
        {
          slot: 1,
          imbuementId: 2,
          remainingSeconds: 7_200,
          name: "Basic Swiftness",
          aggressive: false,
        },
      ],
    },
    version: 3,
    location: { kind: "equipment", characterId: A, slot: "armor" },
  };
  const base = makeCatalog();
  const catalog: ImbuementCatalog = {
    bases: base.bases,
    categories: new Map([
      ...base.categories,
      [
        "speed",
        { id: 1, slug: "speed", name: "Increase Speed", aggressive: false },
      ],
    ]),
    imbuements: new Map([
      ...base.imbuements,
      [
        2,
        {
          id: 2,
          name: "Swiftness",
          baseId: 1,
          categoryId: 1,
          categorySlug: "speed",
          iconId: 14,
          premium: false,
          description: "Raises walking speed.",
          effect: { kind: "speed", amount: 10 } as never,
          astralSources: [{ itemTypeId: SOURCE, count: 25 }],
        },
      ],
    ]),
  };
  const session = {
    id: `session-${A}`,
    playerId: A,
    itemOperationPending: false,
    depotOperationPending: false,
    itemPersistsPending: 0,
    send: () => {},
  } as unknown as Session;
  const registry = {
    all: () => [session].values(),
    sessionFor: () => session,
  } as unknown as SessionRegistry;
  const world = {
    getPlayer: (id: string) =>
      id === A
        ? {
            position: { x: 10, y: 10, z: 7 },
            conditions: new Map(),
            isPremiumAt: () => input.premium,
          }
        : undefined,
    getMapItems: () => [],
    isProtectionZone: () => input.inProtectionZone,
  } as unknown as World;
  const plans: Array<{ mutation: { after: Item[] } }> = [];
  const itemHandler = {
    inventorySnapshot: () => ({ items: [armor], capacityMax: 400 }),
    combatEquipment: () => [{ item: armor, type: { id: ARMOR_TYPE_ID } }],
    applyWorldPlan: (
      _session: Session,
      _characterId: string,
      plan: { mutation: { after: Item[] } },
    ) => plans.push(plan),
  } as unknown as ItemIntentHandler;
  const service = new ImbuementService(
    world,
    registry,
    itemHandler,
    {} as unknown as ItemCatalog,
    undefined,
    catalog,
    new MemoryImbuementStore(),
  );
  return { service, plans };
}

describe("ImbuementService decay (Protected Imbuement)", () => {
  it("burns wall-clock imbuements in a protection zone for free accounts", () => {
    const harness = makeDecayHarness({ premium: false, inProtectionZone: true });
    harness.service.tick(0);
    harness.service.tick(61_000);

    expect(harness.plans).toHaveLength(1);
    const after = harness.plans[0]?.mutation.after[0];
    expect(after?.attributes.imbuements).toEqual([
      expect.objectContaining({ slot: 0, remainingSeconds: 7_200 }),
      expect.objectContaining({ slot: 1, remainingSeconds: 7_200 - 61 }),
    ]);
  });

  it("burns nothing in a protection zone for premium accounts", () => {
    const harness = makeDecayHarness({ premium: true, inProtectionZone: true });
    harness.service.tick(0);
    harness.service.tick(61_000);

    expect(harness.plans).toHaveLength(0);
  });

  it("still burns wall-clock imbuements outside protection zones for premium", () => {
    const harness = makeDecayHarness({ premium: true, inProtectionZone: false });
    harness.service.tick(0);
    harness.service.tick(61_000);

    expect(harness.plans).toHaveLength(1);
    const after = harness.plans[0]?.mutation.after[0];
    expect(after?.attributes.imbuements).toEqual([
      expect.objectContaining({ slot: 0, remainingSeconds: 7_200 }),
      expect.objectContaining({ slot: 1, remainingSeconds: 7_200 - 61 }),
    ]);
  });
});
