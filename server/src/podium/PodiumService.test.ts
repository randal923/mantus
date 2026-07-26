import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { CarriedPlan } from "../item/plan/CarriedPlan";
import type { MapItem } from "../MapItem";
import { Player } from "../Player";
import type { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import type { World } from "../World";
import { PodiumService } from "./PodiumService";
import { podiumStateOf } from "./podiumStateOf";

const PLAYER_ID = "00000000-0000-4000-8000-000000000031";
const POSITION = { x: 10, y: 10, z: 7 };

function harness(options: {
  itemId?: number;
  rootVersion?: number;
  houseAccess?: boolean;
  playerPosition?: { x: number; y: number; z: number };
}) {
  const itemId = options.itemId ?? 35_973;
  const player = new Player(
    makeCharacter(PLAYER_ID, "Editor"),
    options.playerPosition ?? { x: 10, y: 11, z: 7 },
    0,
  );
  const root: Item = {
    id: "podium-item-1",
    typeId: itemId,
    count: 1,
    attributes: {},
    version: options.rootVersion ?? 1,
    location: { kind: "world", position: POSITION, stackIndex: 1 },
  };
  const mapItem: MapItem = {
    instanceId: root.id,
    itemId,
    stackIndex: 1,
    mutable: true,
    revision: root.version,
  };
  const applied: CarriedPlan[] = [];
  const sent: ServerMessage[] = [];
  const world = {
    getPlayer: (id: string) => (id === PLAYER_ID ? player : undefined),
    getMapItems: (position: { x: number; y: number; z: number }) =>
      position.x === POSITION.x &&
      position.y === POSITION.y &&
      position.z === POSITION.z
        ? [mapItem]
        : [],
    getWorldItem: (instanceId: string) =>
      instanceId === root.id ? root : undefined,
    getWorldSubtree: (id: string) => (id === root.id ? [root] : []),
    lootOrigin: () => undefined,
    canSee: () => true,
    getHouseId: () => 42,
  } as unknown as World;
  const items = {
    applyWorldPlan: (
      _session: Session,
      _characterId: string,
      plan: CarriedPlan,
    ) => {
      applied.push(plan);
    },
  } as unknown as ItemIntentHandler;
  const catalog = {
    get: () => undefined,
    require: () => {
      throw new Error("unused");
    },
  } as unknown as ItemCatalog;
  const service = new PodiumService(
    world,
    items,
    catalog,
    {
      outfits: () => [{ lookType: 128, name: "Citizen", addons: 1 }],
      mounts: () => [
        { mountId: 3, name: "War Bear", lookType: 651, speed: 10 },
      ],
      bossRaces: () => [
        {
          raceId: 2_216,
          name: "Grand Master Oberon",
          outfit: {
            lookType: 1_292,
            head: 0,
            body: 0,
            legs: 0,
            feet: 0,
            addons: 0,
          },
        },
      ],
      bestiaryRaces: () => [],
    },
    () => options.houseAccess ?? true,
  );
  const session = {
    playerId: PLAYER_ID,
    viewRange: { x: 15, y: 11 },
    itemOperationPending: false,
    itemPersistsPending: 0,
    send: (message: ServerMessage) => {
      sent.push(message);
    },
  } as unknown as Session;
  return { service, session, applied, sent, mapItem };
}

function setIntent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: "podium-set" as const,
    itemId: "podium-item-1",
    revision: 1,
    position: POSITION,
    podiumVisible: true,
    direction: 2,
    lookType: 128,
    head: 5,
    body: 10,
    legs: 15,
    feet: 20,
    addons: 1,
    mountLookType: 0,
    raceId: 0,
    monsterVisible: true,
    ...overrides,
  };
}

function failureReasons(sent: ReadonlyArray<ServerMessage>): string[] {
  return sent.flatMap((message) =>
    message.type === "podium-action-failed" ? [message.reason] : [],
  );
}

describe("PodiumService", () => {
  it("commits an owned outfit selection", () => {
    const { service, session, applied, sent } = harness({});
    service.handleSet(session, setIntent(), 1_000);
    expect(failureReasons(sent)).toEqual([]);
    expect(applied).toHaveLength(1);
    const after = applied[0]!.mutation.after[0]!;
    const stored = podiumStateOf(after.attributes);
    expect(stored.lookType).toBe(128);
    expect(stored.head).toBe(5);
    expect(after.version).toBe(2);
  });

  it("rejects a forged unowned outfit", () => {
    const { service, session, applied, sent } = harness({});
    service.handleSet(session, setIntent({ lookType: 999 }), 1_000);
    expect(failureReasons(sent)).toEqual(["not-owned"]);
    expect(applied).toHaveLength(0);
  });

  it("rejects addons beyond the granted mask", () => {
    const { service, session, applied, sent } = harness({});
    service.handleSet(session, setIntent({ addons: 3 }), 1_000);
    expect(failureReasons(sent)).toEqual(["not-owned"]);
    expect(applied).toHaveLength(0);
  });

  it("copies a boss look server-side and rejects unowned races", () => {
    const { service, session, applied, sent } = harness({ itemId: 38_707 });
    service.handleSet(
      session,
      setIntent({ lookType: 0, head: 99, raceId: 2_216 }),
      1_000,
    );
    expect(failureReasons(sent)).toEqual([]);
    const stored = podiumStateOf(applied[0]!.mutation.after[0]!.attributes);
    expect(stored.lookType).toBe(1_292);
    expect(stored.head).toBe(0);
    expect(stored.raceId).toBe(2_216);

    service.handleSet(
      session,
      setIntent({ lookType: 0, raceId: 777 }),
      2_000,
    );
    expect(failureReasons(sent)).toEqual(["not-owned"]);
    expect(applied).toHaveLength(1);
  });

  it("rejects a stale revision without mutating", () => {
    const { service, session, applied, sent } = harness({ rootVersion: 4 });
    service.handleSet(session, setIntent({ revision: 3 }), 1_000);
    expect(failureReasons(sent)).toEqual(["stale-item"]);
    expect(applied).toHaveLength(0);
  });

  it("rejects edits from outside reach", () => {
    const { service, session, applied, sent } = harness({
      playerPosition: { x: 20, y: 10, z: 7 },
    });
    service.handleSet(session, setIntent(), 1_000);
    expect(failureReasons(sent)).toEqual(["out-of-reach"]);
    expect(applied).toHaveLength(0);
  });

  it("rejects edits on house tiles without access", () => {
    const { service, session, applied, sent } = harness({
      houseAccess: false,
    });
    service.handleSet(session, setIntent(), 1_000);
    expect(failureReasons(sent)).toEqual(["no-house-access"]);
    expect(applied).toHaveLength(0);
  });

  it("rate-limits rapid edits per session", () => {
    const { service, session, applied, sent } = harness({});
    service.handleSet(session, setIntent(), 1_000);
    service.handleSet(session, setIntent(), 1_100);
    expect(failureReasons(sent)).toEqual(["rate-limited"]);
    expect(applied).toHaveLength(1);
  });
});
