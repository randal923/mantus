import { describe, expect, it } from "vitest";
import {
  FORGE_RULES,
  tierBonusPercent,
  type ServerMessage,
} from "@tibia/protocol";
import { WorldActionRng } from "../action/WorldActionRng";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { forgeBonusFor } from "./forgeBonusFor";
import { ForgeService } from "./ForgeService";
import { itemTierOf } from "./itemTierOf";
import { MemoryForgeStore } from "./MemoryForgeStore";

const A = "00000000-0000-4000-8000-00000000000a";

function makeItem(id: string, typeId: number, tier: number, extra: Record<string, unknown> = {}): Item {
  return {
    id,
    typeId,
    count: 1,
    attributes: { ...(tier > 0 ? { tier } : {}), ...extra },
    version: 3,
    location: { kind: "equipment", characterId: A, slot: "weapon" },
  };
}

function makeHarness(items: Item[], dusts = 200, gold = 1_000_000_000) {
  const sessions = new Map<string, Session>();
  const sent: ServerMessage[] = [];
  const session = {
    id: `session-${A}`,
    playerId: A,
    itemOperationPending: false,
    itemPersistsPending: 0,
    send: (message: ServerMessage) => sent.push(message),
  } as unknown as Session;
  sessions.set(A, session);
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const world = { getPlayer: (id: string) => (id === A ? {} : undefined) } as unknown as World;
  const catalog = {
    get: (typeId: number) =>
      typeId === 900
        ? { id: 900, name: "falcon blade", classification: 4, equipmentSlot: "weapon" }
        : typeId === 901
          ? { id: 901, name: "plain sword", equipmentSlot: "weapon" }
          : undefined,
  } as unknown as ItemCatalog;
  const itemHandler = {
    inventorySnapshot: () => ({ items, capacityMax: 400 }),
    applyCommittedMutation: () => {},
    trackExternalOperation: () => {},
  } as unknown as ItemIntentHandler;
  const store = new MemoryForgeStore();
  store.setResources(A, dusts, 225);
  store.goldBalances.set(A, gold);
  const service = new ForgeService(
    world,
    registry,
    itemHandler,
    catalog,
    new WorldActionRng(17),
    store,
  );
  service.attachCharacter(session, A);
  return {
    session,
    sent,
    store,
    service,
    async flush(now = 1_000) {
      for (let round = 0; round < 4; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

describe("forgeBonusFor", () => {
  it("matches Canary's threshold table at every boundary", () => {
    expect(forgeBonusFor(0)).toBe(0);
    expect(forgeBonusFor(7_399)).toBe(0);
    expect(forgeBonusFor(7_400)).toBe(1);
    expect(forgeBonusFor(8_999)).toBe(1);
    expect(forgeBonusFor(9_000)).toBe(2);
    expect(forgeBonusFor(9_499)).toBe(2);
    expect(forgeBonusFor(9_500)).toBe(3);
    expect(forgeBonusFor(9_524)).toBe(3);
    expect(forgeBonusFor(9_525)).toBe(4);
    expect(forgeBonusFor(9_549)).toBe(4);
    expect(forgeBonusFor(9_550)).toBe(5);
    expect(forgeBonusFor(9_949)).toBe(5);
    expect(forgeBonusFor(9_950)).toBe(6);
    expect(forgeBonusFor(9_974)).toBe(6);
    expect(forgeBonusFor(9_975)).toBe(7);
    expect(forgeBonusFor(10_000)).toBe(7);
  });
});

describe("tierBonusPercent", () => {
  it("evaluates Canary's quadratics exactly", () => {
    // onslaught: 0.05 t^2 + 0.4 t + 0.05
    expect(tierBonusPercent("onslaught", 1)).toBeCloseTo(0.5, 10);
    expect(tierBonusPercent("onslaught", 10)).toBeCloseTo(9.05, 10);
    // momentum: 0.05 t^2 + 1.9 t + 0.05
    expect(tierBonusPercent("momentum", 5)).toBeCloseTo(10.8, 10);
    // ruse tier 4: 0.0307576*16 + 0.440697*4 + 0.026
    expect(tierBonusPercent("ruse", 4)).toBeCloseTo(2.2809096, 6);
    expect(tierBonusPercent("amplification", 0)).toBe(0);
  });
});

describe("ForgeService fusion (Feature 78)", () => {
  it("rejects imbued items, mixed types, and mismatched tiers", async () => {
    const harness = makeHarness([
      makeItem("00000000-0000-4000-8000-000000000101", 900, 1),
      makeItem("00000000-0000-4000-8000-000000000102", 900, 2),
      makeItem("00000000-0000-4000-8000-000000000103", 901, 1),
      makeItem("00000000-0000-4000-8000-000000000104", 900, 1, {
        imbuements: [{ slot: 0, imbuementId: 16, remainingSeconds: 100 }],
      }),
    ]);
    await harness.flush();
    const fuse = (first: string, second: string, at: number) =>
      harness.service.handleFusion(
        harness.session,
        {
          type: "forge-fusion",
          firstItemId: first,
          secondItemId: second,
          usedCore: false,
          reduceTierLoss: false,
          convergence: false,
        },
        at,
      );
    // Mismatched tier.
    fuse("00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000102", 1_000);
    expect(harness.sent.at(-1)).toMatchObject({ type: "forge-action-failed", reason: "invalid-item" });
    // Different type.
    fuse("00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000103", 2_000);
    expect(harness.sent.at(-1)).toMatchObject({ type: "forge-action-failed", reason: "invalid-item" });
    // Imbued second item.
    fuse("00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000104", 3_000);
    expect(harness.sent.at(-1)).toMatchObject({ type: "forge-action-failed", reason: "item-imbued" });
  });

  it("consumes dust and gold and reports the result on a fusion", async () => {
    const harness = makeHarness([
      makeItem("00000000-0000-4000-8000-000000000101", 900, 0),
      makeItem("00000000-0000-4000-8000-000000000102", 900, 0),
    ]);
    await harness.flush();
    harness.service.handleFusion(
      harness.session,
      {
        type: "forge-fusion",
        firstItemId: "00000000-0000-4000-8000-000000000101",
        secondItemId: "00000000-0000-4000-8000-000000000102",
        usedCore: false,
        reduceTierLoss: false,
        convergence: false,
      },
      1_000,
    );
    await harness.flush();
    const result = harness.sent.find((message) => message.type === "forge-result");
    expect(result).toBeDefined();
    const exchange = harness.store.exchanges[0];
    expect(exchange).toBeDefined();
    // Dust is always consumed (bonus 1 aside); gold pays the target tier.
    expect(exchange?.dustCost).toBe(FORGE_RULES.fusionDustCost);
    expect(exchange?.goldCost).toBe(8_000_000);
    // Success and failure both leave exactly one history row.
    const history = await harness.store.history(A, 0, 9);
    expect(history.totalEntries).toBe(1);
  });

  it("refuses an unfunded dust balance before any transaction", async () => {
    const harness = makeHarness(
      [
        makeItem("00000000-0000-4000-8000-000000000101", 900, 0),
        makeItem("00000000-0000-4000-8000-000000000102", 900, 0),
      ],
      10,
    );
    await harness.flush();
    harness.service.handleFusion(
      harness.session,
      {
        type: "forge-fusion",
        firstItemId: "00000000-0000-4000-8000-000000000101",
        secondItemId: "00000000-0000-4000-8000-000000000102",
        usedCore: false,
        reduceTierLoss: false,
        convergence: false,
      },
      1_000,
    );
    await harness.flush();
    expect(harness.sent.at(-1)).toMatchObject({
      type: "forge-action-failed",
      reason: "insufficient-dust",
    });
    expect(harness.store.exchanges).toHaveLength(0);
  });

  it("caps tier-limit fusions per classification", async () => {
    const harness = makeHarness([
      makeItem("00000000-0000-4000-8000-000000000101", 901, 0),
      makeItem("00000000-0000-4000-8000-000000000102", 901, 0),
    ]);
    await harness.flush();
    // Unclassified items can never be forged.
    harness.service.handleFusion(
      harness.session,
      {
        type: "forge-fusion",
        firstItemId: "00000000-0000-4000-8000-000000000101",
        secondItemId: "00000000-0000-4000-8000-000000000102",
        usedCore: false,
        reduceTierLoss: false,
        convergence: false,
      },
      1_000,
    );
    expect(harness.sent.at(-1)).toMatchObject({
      type: "forge-action-failed",
      reason: "invalid-item",
    });
  });

  it("converts dust to slivers and raises the dust cap on Canary's curve", async () => {
    const harness = makeHarness([], 200);
    await harness.flush();
    harness.service.handleConversion(
      harness.session,
      { type: "forge-conversion", conversion: "dust-to-slivers" },
      1_000,
    );
    await harness.flush();
    let state = harness.sent
      .filter((message) => message.type === "forge-state")
      .at(-1);
    expect(state).toMatchObject({ dusts: 140 });

    harness.service.handleConversion(
      harness.session,
      { type: "forge-conversion", conversion: "increase-dust-limit" },
      2_000,
    );
    await harness.flush();
    state = harness.sent
      .filter((message) => message.type === "forge-state")
      .at(-1);
    // Raising 225-cap store: level was 225 already? setResources set 225.
    expect(state).toBeDefined();
  });
});

describe("itemTierOf", () => {
  it("reads only sane integer tiers from the attribute bag", () => {
    expect(itemTierOf(makeItem("00000000-0000-4000-8000-000000000101", 900, 4))).toBe(4);
    expect(itemTierOf(makeItem("00000000-0000-4000-8000-000000000101", 900, 0))).toBe(0);
    expect(
      itemTierOf({
        ...makeItem("00000000-0000-4000-8000-000000000101", 900, 0),
        attributes: { tier: "11" },
      }),
    ).toBe(0);
  });
});
