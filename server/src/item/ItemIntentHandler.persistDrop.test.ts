import { beforeAll, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { loadItemCatalog } from "./loadItemCatalog";
import { MemoryItemStore } from "./MemoryItemStore";

const CHARACTER_ID = "3d2af45f-e037-44f5-bd50-7bc655c6cd0e";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

const settle = async () => {
  for (let turn = 0; turn < 4; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

function makeHarness() {
  const world = new World(
    gridMapData({ name: "drop-test", width: 4, height: 4, blocked: [] }),
    25,
  );
  const socket = {
    OPEN: 1,
    readyState: 1,
    on: vi.fn(),
    terminate: vi.fn(),
    send: vi.fn(),
  } as unknown as WebSocket;
  const session = new Session("session", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = CHARACTER_ID;
  const handler = new ItemIntentHandler(
    new MemoryItemStore(catalog),
    catalog,
    world,
    new Visibility(world, new SessionRegistry()),
  );
  // Stand in for the resync runner so a failure does not disconnect.
  handler.setPersistResync(() => undefined);
  return { handler, session };
}

describe("dropped item persists", () => {
  it("compensates a write that failed and every write skipped behind it", async () => {
    const { handler, session } = makeHarness();
    const dropped: string[] = [];
    const secondWrite = vi.fn(() => Promise.resolve());

    handler.enqueuePersist(
      session,
      CHARACTER_ID,
      () => Promise.reject(new Error("carried persist write missed item")),
      () => dropped.push("failed"),
    );
    await settle();
    handler.applyResolvedOutcomes(0);

    expect(dropped).toEqual(["failed"]);
    expect(handler.isPersistPoisoned(CHARACTER_ID)).toBe(true);

    handler.enqueuePersist(session, CHARACTER_ID, secondWrite, () =>
      dropped.push("skipped"),
    );
    await settle();
    handler.applyResolvedOutcomes(0);

    expect(secondWrite).not.toHaveBeenCalled();
    expect(dropped).toEqual(["failed", "skipped"]);
  });

  it("leaves a committed write uncompensated", async () => {
    const { handler, session } = makeHarness();
    const dropped: string[] = [];

    handler.enqueuePersist(
      session,
      CHARACTER_ID,
      () => Promise.resolve(),
      () => dropped.push("committed"),
    );
    await settle();
    handler.applyResolvedOutcomes(0);

    expect(dropped).toEqual([]);
    expect(handler.isPersistPoisoned(CHARACTER_ID)).toBe(false);
  });
});
