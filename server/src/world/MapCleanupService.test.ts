import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { World } from "../World";
import { MapCleanupService } from "./MapCleanupService";

const GOLD_TYPE = 3031;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function groundItem(id: string, x: number): Item {
  return {
    id,
    typeId: GOLD_TYPE,
    count: 5,
    attributes: {},
    version: 1,
    location: { kind: "world", position: { x, y: 2, z: 7 }, stackIndex: 0 },
  };
}

function makeHarness(warningMinutes = 5) {
  const world = new World(
    gridMapData({ name: "clean-test", width: 12, height: 12, blocked: [] }),
    25,
  );
  const registry = new SessionRegistry();
  const sent: ServerMessage[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    terminate: vi.fn(),
    send: (value: string) => sent.push(JSON.parse(value) as ServerMessage),
  } as unknown as WebSocket;
  const session = new Session("session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = "8c1f2b73-9a4e-4d61-9b7c-0a3e6f5d4c22";
  registry.add(session);
  const cleaned: Item[][] = [];
  const items = {
    cleanWorldItems: (batch: ReadonlyArray<Item>) => {
      cleaned.push([...batch]);
      return batch.length;
    },
  };
  const service = new MapCleanupService(
    world,
    catalog,
    items,
    registry,
    {
      intervalMs: 2 * HOUR_MS,
      warningMinutes,
      cleanProtectionZones: false,
    },
    0,
  );
  const notices = () =>
    sent
      .filter((message) => message.type === "server-notice")
      .map((message) => (message as { text: string }).text);
  return { world, service, notices, cleaned };
}

describe("MapCleanupService", () => {
  it("counts the sweep down one broadcast per minute, then cleans", () => {
    const { world, service, notices, cleaned } = makeHarness();
    world.applyCreatedWorldItems([groundItem("a", 2), groundItem("b", 3)]);

    const cleanAt = 2 * HOUR_MS;
    service.tick(cleanAt - 6 * MINUTE_MS);
    expect(notices()).toEqual([]);

    for (let minute = 5; minute >= 1; minute--) {
      service.tick(cleanAt - minute * MINUTE_MS);
    }
    expect(notices()).toEqual([
      "The map will be cleaned in 5 minutes. Items left on the ground will be removed.",
      "The map will be cleaned in 4 minutes. Items left on the ground will be removed.",
      "The map will be cleaned in 3 minutes. Items left on the ground will be removed.",
      "The map will be cleaned in 2 minutes. Items left on the ground will be removed.",
      "The map will be cleaned in 1 minute. Items left on the ground will be removed.",
    ]);

    service.tick(cleanAt);
    expect(cleaned).toEqual([[expect.objectContaining({ id: "a" }), expect.objectContaining({ id: "b" })]]);
    expect(notices().at(-1)).toBe("Cleaned 2 items from the map.");
    expect(service.scheduledAt).toBe(cleanAt + 2 * HOUR_MS);
  });

  it("announces only the nearest warning when ticks skip minutes", () => {
    const { service, notices } = makeHarness();
    const cleanAt = 2 * HOUR_MS;

    service.tick(cleanAt - 90_000);

    expect(notices()).toEqual([
      "The map will be cleaned in 2 minutes. Items left on the ground will be removed.",
    ]);
  });

  it("says so when there was nothing to clean", () => {
    const { service, notices, cleaned } = makeHarness(0);

    service.tick(2 * HOUR_MS);

    expect(cleaned).toEqual([]);
    expect(notices()).toEqual(["The map was already clean: no items removed."]);
  });

  it("arms the next countdown after a sweep", () => {
    const { world, service, notices } = makeHarness();
    world.applyCreatedWorldItems([groundItem("a", 2)]);
    const firstClean = 2 * HOUR_MS;
    service.tick(firstClean);

    service.tick(firstClean + 2 * HOUR_MS - MINUTE_MS);

    expect(notices().at(-1)).toBe(
      "The map will be cleaned in 1 minute. Items left on the ground will be removed.",
    );
  });
});
