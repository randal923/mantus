import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { MemoryProfileStore } from "./MemoryProfileStore";
import { ProfileService } from "./ProfileService";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

interface TestPlayer {
  readonly session: Session;
  readonly sent: ServerMessage[];
}

function makeHarness() {
  const world = new World(
    gridMapData({ name: "profiles", width: 40, height: 40, blocked: [], floors: [7] }),
    25,
  );
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const store = new MemoryProfileStore();
  const guilds = new Map<string, string>();
  const service = new ProfileService(
    world,
    registry,
    (characterId) => guilds.get(characterId) ?? null,
    store,
  );
  let nextSpawnX = 4;
  return {
    store,
    service,
    guilds,
    join(id: string, name: string, level = 1): TestPlayer {
      nextSpawnX += 2;
      const player = new Player(
        {
          ...makeCharacter(id, name),
          level,
          experience: BigInt(getExperienceForLevel(level)),
        },
        { x: nextSpawnX, y: 4, z: 7 },
        0,
        null,
      );
      world.addPlayer(player);
      store.registerCharacter(id, name, level);
      const sent: ServerMessage[] = [];
      const session = {
        id: `session-${id}`,
        playerId: id,
        send: (message: ServerMessage) => sent.push(message),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      service.attachCharacter(session, id);
      return { session, sent };
    },
    async flush(now = 0) {
      for (let round = 0; round < 3; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

const messagesOf = <TType extends ServerMessage["type"]>(
  player: TestPlayer,
  type: TType,
): Array<Extract<ServerMessage, { type: TType }>> =>
  player.sent.filter(
    (message): message is Extract<ServerMessage, { type: TType }> =>
      message.type === type,
  );

describe("ProfileService", () => {
  it("grants a level milestone exactly once across repeated sweeps", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice", 50);
    await harness.flush();

    for (let sweep = 0; sweep < 3; sweep += 1) {
      harness.service.tick(sweep * 10_000);
      await harness.flush(sweep * 10_000);
    }

    const granted = messagesOf(alice, "achievement-granted");
    // Level 50 clears both the level-10 and level-50 milestones, once each.
    expect(granted.map((event) => event.achievementId).sort()).toEqual([
      "first-steps",
      "seasoned-traveller",
    ]);
    const state = messagesOf(alice, "profile-state").at(-1);
    expect(state?.points).toBe(3);
    expect(
      state?.titles.find((title) => title.titleId === "traveller")?.granted,
    ).toBe(true);
  });

  it("refuses a title the character was never granted", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice", 5);
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "profile-select-title", titleId: "legend" },
      1_000,
    );
    await harness.flush(1_000);
    expect(messagesOf(alice, "profile-action-failed").at(-1)?.reason).toBe(
      "not-granted",
    );
    expect(messagesOf(alice, "profile-state").at(-1)?.selectedTitle).toBeNull();
  });

  it("shows only granted achievements on a public profile and no private state", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice", 50);
    const bob = harness.join(B, "Bob", 8);
    harness.guilds.set(A, "Red Rose");
    await harness.flush();
    harness.service.tick(10_000);
    await harness.flush(10_000);

    harness.service.handle(
      bob.session,
      { type: "character-profile-get", name: "Alice" },
      20_000,
    );
    await harness.flush(20_000);
    const profile = messagesOf(bob, "character-profile").at(-1);
    expect(profile?.name).toBe("Alice");
    expect(profile?.guildName).toBe("Red Rose");
    // Only granted rows are public — the catalog is not enumerated.
    expect(profile?.achievements.every((entry) => entry.granted)).toBe(true);
    expect(profile?.achievements.map((entry) => entry.achievementId)).toEqual([
      "first-steps",
      "seasoned-traveller",
    ]);
    // The projection carries no position, health, or online flag at all.
    expect(Object.keys(profile ?? {})).toEqual([
      "type",
      "name",
      "level",
      "vocation",
      "guildName",
      "title",
      "points",
      "achievements",
      "badges",
    ]);
  });

  it("rate-limits bug reports and stamps the server's own position", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "bug-report", category: "bug", message: "the door is stuck" },
      1_000,
    );
    await harness.flush(1_000);
    expect(messagesOf(alice, "server-notice")).toHaveLength(1);

    // Second report inside the interval is refused before it reaches storage.
    harness.service.handle(
      alice.session,
      { type: "bug-report", category: "bug", message: "again" },
      2_100,
    );
    await harness.flush(2_100);
    expect(messagesOf(alice, "profile-action-failed").at(-1)?.reason).toBe(
      "rate-limited",
    );
    expect(messagesOf(alice, "server-notice")).toHaveLength(1);
  });
});
