import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { HighscoreService } from "./HighscoreService";
import {
  MemoryHighscoreStore,
  type MemoryHighscoreCharacter,
} from "./MemoryHighscoreStore";

const A = "00000000-0000-4000-8000-00000000000a";

const RANKED: MemoryHighscoreCharacter[] = [
  {
    name: "Alice",
    level: 30,
    vocation: "Knight",
    experience: 100_000,
    magicLevel: 4,
    skills: { sword: 70 },
  },
  {
    name: "Bob",
    level: 20,
    vocation: "Sorcerer",
    experience: 40_000,
    magicLevel: 50,
    skills: {},
  },
  {
    name: "Carol",
    level: 25,
    vocation: "Knight",
    experience: 60_000,
    magicLevel: 8,
    skills: { sword: 55 },
  },
];

interface Harness {
  readonly store: MemoryHighscoreStore;
  readonly service: HighscoreService;
  readonly session: Session;
  readonly sent: ServerMessage[];
  flush(now?: number): Promise<void>;
}

function makeHarness(): Harness {
  const world = new World(
    gridMapData({
      name: "highscore-test",
      width: 60,
      height: 60,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const player = new Player(makeCharacter(A, "Alice"), { x: 30, y: 30, z: 7 }, 0);
  world.addPlayer(player);
  const sent: ServerMessage[] = [];
  const session = {
    id: "session-a",
    playerId: A,
    send: (message: ServerMessage) => sent.push(message),
    sendError: () => {},
  } as unknown as Session;
  const store = new MemoryHighscoreStore(RANKED);
  const service = new HighscoreService(world, store);
  return {
    store,
    service,
    session,
    sent,
    async flush(now = 0) {
      await service.stop();
      service.applyResolvedOutcomes(now);
    },
  };
}

function states(harness: Harness) {
  return harness.sent.filter(
    (message): message is Extract<ServerMessage, { type: "highscores-state" }> =>
      message.type === "highscores-state",
  );
}

describe("HighscoreService", () => {
  it("serves ranked pages exposing only the public fields", async () => {
    const harness = makeHarness();
    harness.service.handle(
      harness.session,
      { type: "highscores-get", category: "experience", page: 0 },
      1_000,
    );
    await harness.flush(1_000);

    const state = states(harness).at(-1);
    expect(state?.totalPages).toBe(1);
    expect(state?.entries.map((entry) => entry.name)).toEqual([
      "Alice",
      "Carol",
      "Bob",
    ]);
    expect(state?.entries[0]).toEqual({
      rank: 1,
      name: "Alice",
      level: 30,
      vocation: "Knight",
      value: 100_000,
    });
    // Exactly the public projection: no ids, positions, or private stats.
    expect(Object.keys(state?.entries[0] ?? {}).sort()).toEqual([
      "level",
      "name",
      "rank",
      "value",
      "vocation",
    ]);
  });

  it("applies the vocation filter", async () => {
    const harness = makeHarness();
    harness.service.handle(
      harness.session,
      {
        type: "highscores-get",
        category: "sword",
        vocation: "Knight",
        page: 0,
      },
      1_000,
    );
    await harness.flush(1_000);
    expect(states(harness).at(-1)?.entries.map((entry) => entry.name)).toEqual([
      "Alice",
      "Carol",
    ]);
  });

  it("caches pages for the TTL and refreshes after it expires", async () => {
    const harness = makeHarness();
    const request = {
      type: "highscores-get",
      category: "experience",
      page: 0,
    } as const;
    harness.service.handle(harness.session, request, 1_000);
    await harness.flush(1_000);
    expect(harness.store.loadCount).toBe(1);

    harness.service.handle(harness.session, request, 10_000);
    await harness.flush(10_000);
    expect(harness.store.loadCount).toBe(1);
    expect(states(harness)).toHaveLength(2);

    // Past the 10-minute TTL the page is re-read from the store.
    harness.service.handle(harness.session, request, 1_000 + 601_000);
    await harness.flush(1_000 + 601_000);
    expect(harness.store.loadCount).toBe(2);
  });

  it("re-checks the page bound and rate limit at execution time", async () => {
    const harness = makeHarness();
    harness.service.handle(
      harness.session,
      { type: "highscores-get", category: "experience", page: 25 },
      1_000,
    );
    await harness.flush(1_000);
    expect(harness.sent.at(-1)).toEqual({
      type: "highscores-action-failed",
      reason: "invalid-request",
    });

    harness.service.handle(
      harness.session,
      { type: "highscores-get", category: "experience", page: 0 },
      2_000,
    );
    harness.service.handle(
      harness.session,
      { type: "highscores-get", category: "magic", page: 0 },
      2_100,
    );
    expect(harness.sent.at(-1)).toEqual({
      type: "highscores-action-failed",
      reason: "rate-limited",
    });
    await harness.flush(2_100);
  });

  it("returns an empty page beyond the ranked data", async () => {
    const harness = makeHarness();
    harness.service.handle(
      harness.session,
      { type: "highscores-get", category: "experience", page: 19 },
      1_000,
    );
    await harness.flush(1_000);
    const state = states(harness).at(-1);
    expect(state?.entries).toHaveLength(0);
    expect(state?.totalPages).toBe(1);
  });
});
