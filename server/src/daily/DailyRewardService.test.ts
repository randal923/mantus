import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { localDayKey } from "../boosted/localDayKey";
import { DailyRewardService } from "./DailyRewardService";
import type {
  DailyRewardSnapshot,
  DailyRewardStore,
} from "./DailyRewardStore";

const A = "00000000-0000-4000-8000-00000000000a";
const SHRINE = { x: 30, y: 31, z: 7 };
/** Mid-afternoon local time, so "tomorrow" is a real day boundary away. */
const NOW = new Date(2026, 6, 14, 15, 0, 0).getTime();
const TOMORROW = new Date(2026, 6, 15, 15, 0, 0).getTime();

function makeHarness(snapshot: DailyRewardSnapshot) {
  const world = new World(
    gridMapData({
      name: "daily-test",
      width: 60,
      height: 60,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const player = new Player(
    makeCharacter(A, "Alice"),
    { x: 30, y: 30, z: 7 },
    0,
  );
  world.addPlayer(player);
  const sent: ServerMessage[] = [];
  const session = {
    id: "session-a",
    playerId: A,
    send: (message: ServerMessage) => sent.push(message),
  } as unknown as Session;
  const registry = {
    sessionFor: (characterId: string) =>
      characterId === A ? session : undefined,
  } as unknown as SessionRegistry;
  const store = {
    load: async () => snapshot,
    claim: async () => ({ status: "already-claimed" as const }),
    history: async () => [],
  } satisfies DailyRewardStore;
  const service = new DailyRewardService(
    world,
    registry,
    {} as unknown as ItemIntentHandler,
    { get: () => undefined } as unknown as ItemCatalog,
    undefined,
    store,
  );
  return { player, service, session, sent };
}

async function attach(
  service: DailyRewardService,
  session: Session,
  now: number,
): Promise<void> {
  service.attachCharacter(session, A);
  await service.stop();
  service.applyResolvedOutcomes(now);
}

const CLAIMED_TODAY: DailyRewardSnapshot = {
  streakPosition: 3,
  streakLevel: 12,
  jokerTokens: 2,
  lastClaimDay: localDayKey(NOW),
  lastJokerMonth: localDayKey(NOW).slice(0, 7),
  xpBoostUntilMs: 0,
};

function stateMessages(sent: ReadonlyArray<ServerMessage>) {
  return sent.filter((message) => message.type === "daily-rewards-state");
}

describe("DailyRewardService", () => {
  it("projects today's claim as unavailable once it is taken", async () => {
    const { player, service, session, sent } = makeHarness(CLAIMED_TODAY);
    await attach(service, session, NOW);

    service.openShrine(session, player, SHRINE, NOW);

    const [state] = stateMessages(sent);
    expect(state).toMatchObject({
      claimableToday: false,
      streakPosition: 3,
      streakLevel: 12,
    });
    expect(state?.type === "daily-rewards-state" && state.dayEndsAtMs).toBe(
      new Date(2026, 6, 15).getTime(),
    );
  });

  it("re-projects the open window as claimable after the day flips", async () => {
    const { player, service, session, sent } = makeHarness(CLAIMED_TODAY);
    await attach(service, session, NOW);
    service.openShrine(session, player, SHRINE, NOW);

    service.handleStateGet(session, TOMORROW);

    const [, refreshed] = stateMessages(sent);
    expect(refreshed).toMatchObject({
      claimableToday: true,
      // The cycle position is untouched until the claim itself advances it.
      streakPosition: 3,
      missedDays: 0,
    });
    expect(
      refreshed?.type === "daily-rewards-state" && refreshed.dayEndsAtMs,
    ).toBe(new Date(2026, 6, 16).getTime());
  });

  it("refuses a refresh from a session that never opened a shrine", async () => {
    const { service, session, sent } = makeHarness(CLAIMED_TODAY);
    await attach(service, session, NOW);

    service.handleStateGet(session, NOW);

    expect(stateMessages(sent)).toHaveLength(0);
    expect(sent).toEqual([
      { type: "daily-action-failed", reason: "invalid-request" },
    ]);
  });

  it("rate-limits refreshes to one per second", async () => {
    const { player, service, session, sent } = makeHarness(CLAIMED_TODAY);
    await attach(service, session, NOW);
    service.openShrine(session, player, SHRINE, NOW);

    service.handleStateGet(session, TOMORROW);
    service.handleStateGet(session, TOMORROW + 500);
    service.handleStateGet(session, TOMORROW + 1_500);

    expect(stateMessages(sent)).toHaveLength(3);
    expect(sent).toContainEqual({
      type: "daily-action-failed",
      reason: "rate-limited",
    });
  });
});
