import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { DepotService } from "../depot/DepotService";
import type { Item } from "../item/Item";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { EMPTY_PROFICIENCY_EFFECTS } from "../proficiency/ProficiencyPerkEffects";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { CyclopediaService } from "./CyclopediaService";
import { MemoryCyclopediaStore } from "./MemoryCyclopediaStore";

const A = "00000000-0000-4000-8000-00000000000a";

function makeItem(
  id: string,
  typeId: number,
  count: number,
  tier = 0,
  location: Item["location"] = {
    kind: "equipment",
    characterId: A,
    slot: "weapon",
  },
): Item {
  return {
    id,
    typeId,
    count,
    attributes: tier > 0 ? { tier } : {},
    version: 1,
    location,
  };
}

function makeHarness() {
  const sent: ServerMessage[] = [];
  const session = {
    id: `session-${A}`,
    playerId: A,
    fightMode: { attack: "balanced" },
    send: (message: ServerMessage) => sent.push(message),
  } as unknown as Session;
  const registry = {
    sessionFor: (playerId: string) => (playerId === A ? session : undefined),
  } as unknown as SessionRegistry;
  const world = { getPlayer: () => undefined } as unknown as World;
  const carried = [
    makeItem("00000000-0000-4000-8000-000000000201", 3273, 1, 2),
    makeItem("00000000-0000-4000-8000-000000000202", 3031, 60, 0, {
      kind: "container",
      containerId: "00000000-0000-4000-8000-000000000209",
      slot: 0,
    }),
    makeItem("00000000-0000-4000-8000-000000000203", 3031, 40, 0, {
      kind: "container",
      containerId: "00000000-0000-4000-8000-000000000209",
      slot: 1,
    }),
  ];
  const items = {
    inventorySnapshot: () => ({ items: carried, capacityMax: 400 }),
    combatEquipment: () => [],
    imbuementEffects: () => ({
      skills: {},
      magicLevel: 0,
      criticalChancePercent: 0,
      criticalDamagePercent: 0,
      lifeLeechPercent: 0,
      manaLeechPercent: 0,
      elementalDamage: null,
      absorb: {},
      paralysisRemoveChancePercent: 0,
    }),
  } as unknown as ItemIntentHandler;
  const depot = {
    cacheFor: () => ({
      items: [
        makeItem("00000000-0000-4000-8000-000000000301", 3273, 1, 2, {
          kind: "depot",
          characterId: A,
          depotId: 1,
          slot: 0,
        }),
        makeItem("00000000-0000-4000-8000-000000000302", 3055, 1, 0, {
          kind: "inbox",
          characterId: A,
          slot: 0,
        }),
      ],
      stash: new Map([[3031, 12_000]]),
    }),
  } as unknown as DepotService;
  const store = new MemoryCyclopediaStore();
  const service = new CyclopediaService(
    world,
    registry,
    items,
    depot,
    { effectsFor: () => EMPTY_PROFICIENCY_EFFECTS, isBoss: () => false },
    store,
  );
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

describe("CyclopediaService (Feature 83)", () => {
  it("aggregates the item summary by type and tier from own caches only", () => {
    const harness = makeHarness();
    harness.service.handle(
      harness.session,
      { type: "cyclopedia-character-get", view: "item-summary" },
      1_000,
    );
    const state = harness.sent.at(-1);
    expect(state).toMatchObject({
      type: "cyclopedia-item-summary-state",
      carried: [
        { itemTypeId: 3031, tier: 0, count: 100 },
        { itemTypeId: 3273, tier: 2, count: 1 },
      ],
      depot: [{ itemTypeId: 3273, tier: 2, count: 1 }],
      inbox: [{ itemTypeId: 3055, tier: 0, count: 1 }],
      stash: [{ itemTypeId: 3031, tier: 0, count: 12_000 }],
    });
  });

  it("pages death history through the windowed store query", async () => {
    const harness = makeHarness();
    for (let index = 0; index < 17; index += 1) {
      await harness.store.recordDeath(A, 40 + index, `Died at level ${40 + index} by a dragon.`);
    }
    harness.service.handle(
      harness.session,
      { type: "cyclopedia-character-get", view: "deaths", page: 0 },
      1_000,
    );
    await harness.flush();
    const state = harness.sent.at(-1);
    expect(state).toMatchObject({
      type: "cyclopedia-deaths-state",
      page: 0,
      totalPages: 2,
    });
    if (state?.type === "cyclopedia-deaths-state") {
      expect(state.entries).toHaveLength(15);
      expect(state.entries[0]?.level).toBe(56);
    }
  });

  it("reports own PvP kills with their justified status", async () => {
    const harness = makeHarness();
    harness.store.pvpKills.set(A, [
      { at: 1, victimName: "Rival", unjustified: true },
    ]);
    harness.service.handle(
      harness.session,
      { type: "cyclopedia-character-get", view: "pvp-kills", page: 0 },
      1_000,
    );
    await harness.flush();
    expect(harness.sent.at(-1)).toMatchObject({
      type: "cyclopedia-pvp-kills-state",
      entries: [
        { description: "Killed Rival.", status: "unjustified" },
      ],
    });
  });

  it("rate-limits repeat requests inside the cooldown window", () => {
    const harness = makeHarness();
    harness.service.handle(
      harness.session,
      { type: "cyclopedia-character-get", view: "item-summary" },
      1_000,
    );
    harness.service.handle(
      harness.session,
      { type: "cyclopedia-character-get", view: "item-summary" },
      1_100,
    );
    expect(harness.sent.at(-1)).toMatchObject({
      type: "cyclopedia-action-failed",
      reason: "rate-limited",
    });
  });
});
