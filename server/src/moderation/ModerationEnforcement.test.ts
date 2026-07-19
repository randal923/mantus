import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { ChatHandler } from "../chat/ChatHandler";
import { gridMapData } from "../gridMapData";
import { GuildService } from "../guild/GuildService";
import { MemoryGuildStore } from "../guild/MemoryGuildStore";
import { PartyHandler } from "../party/PartyHandler";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { MemoryModerationStore } from "./MemoryModerationStore";
import { ModerationService } from "./ModerationService";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

interface TestPlayer {
  readonly player: Player;
  readonly session: Session;
  readonly sent: ServerMessage[];
}

interface Harness {
  readonly moderation: ModerationService;
  readonly store: MemoryModerationStore;
  readonly chat: ChatHandler;
  readonly parties: PartyHandler;
  readonly guilds: GuildService;
  readonly alice: TestPlayer;
  readonly bob: TestPlayer;
  flushGuilds(now?: number): Promise<void>;
  flushModeration(now?: number): Promise<void>;
}

function rejectionsOf(testPlayer: TestPlayer) {
  return testPlayer.sent.filter(
    (message): message is Extract<ServerMessage, { type: "chat-rejected" }> =>
      message.type === "chat-rejected",
  );
}

function makeHarness(): Harness {
  const world = new World(
    gridMapData({
      name: "moderation-test",
      width: 100,
      height: 100,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryModerationStore();
  const moderation = new ModerationService(registry, store);
  const guildStore = new MemoryGuildStore();
  const guilds = new GuildService(
    world,
    registry,
    visibility,
    guildStore,
    moderation,
  );
  const parties = new PartyHandler(world, registry, visibility, moderation);
  const chat = new ChatHandler(
    world,
    registry,
    visibility,
    undefined,
    undefined,
    moderation,
  );
  let nextSpawnX = 40;
  const join = (id: string, name: string): TestPlayer => {
    nextSpawnX += 2;
    const player = new Player(
      makeCharacter(id, name),
      { x: nextSpawnX, y: 50, z: 7 },
      0,
    );
    world.addPlayer(player);
    store.registerCharacter(id, name, `acc-${name}`);
    guildStore.registerCharacter(id, name);
    const sent: ServerMessage[] = [];
    const session = {
      id: `session-${id}`,
      playerId: id,
      viewRange: { x: 8, y: 6 },
      knownCreatureIds: new Set([id]),
      knownMapItemTiles: new Map(),
      attackTargetId: null,
      send: (message: ServerMessage) => sent.push(message),
      sendError: () => {},
    } as unknown as Session;
    sessions.set(id, session);
    return { player, session, sent };
  };
  const alice = join(A, "Alice");
  const bob = join(B, "Bob");
  return {
    moderation,
    store,
    chat,
    parties,
    guilds,
    alice,
    bob,
    async flushGuilds(now = 0) {
      for (let round = 0; round < 3; round += 1) {
        await guilds.stop();
        guilds.applyResolvedOutcomes(now);
      }
    },
    async flushModeration(now = 0) {
      await moderation.stop();
      moderation.applyResolvedOutcomes(now);
    },
  };
}

/** Puts Alice and Bob in one party (Alice leads). */
function formParty(harness: Harness, now: number): void {
  harness.parties.handle(
    harness.alice.session,
    { type: "party-invite", targetName: "Bob" },
    now,
  );
  harness.parties.handle(
    harness.bob.session,
    { type: "party-respond-invite", leaderId: A, accept: true },
    now + 1_100,
  );
}

/** Founds a guild for Alice. */
async function formGuild(harness: Harness, now: number): Promise<void> {
  harness.guilds.handle(
    harness.alice.session,
    { type: "guild-create", name: "Iron Pact" },
    now,
  );
  await harness.flushGuilds(now);
}

describe("moderation enforcement across chat paths", () => {
  it("a GM mute silences say, private, party, and guild chat until it expires", async () => {
    const harness = makeHarness();
    const base = Date.now();
    formParty(harness, base);
    await formGuild(harness, base + 3_000);

    await harness.store.muteCharacter({
      actorCharacterId: B,
      targetName: "Alice",
      durationMs: 60_000,
      reason: "spam",
    });
    harness.moderation.attachCharacter(A);
    await harness.flushModeration(base);

    const muted = base + 1_000;
    harness.chat.handle(
      harness.alice.session,
      { type: "speak", mode: "say", text: "hello" },
      muted,
    );
    harness.chat.handle(
      harness.alice.session,
      { type: "private-chat", to: "Bob", text: "psst" },
      muted,
    );
    harness.parties.handle(
      harness.alice.session,
      { type: "party-chat", text: "party?" },
      muted,
    );
    harness.guilds.handle(
      harness.alice.session,
      { type: "guild-chat", text: "guild?" },
      muted,
    );
    expect(
      rejectionsOf(harness.alice).filter((message) => message.reason === "muted"),
    ).toHaveLength(4);
    expect(
      harness.bob.sent.some(
        (message) =>
          message.type === "creature-spoke" ||
          message.type === "private-chat-delivered" ||
          message.type === "party-chat-delivered" ||
          message.type === "guild-chat-delivered",
      ),
    ).toBe(false);

    // Expiry honored: the same intents deliver after the mute lapses.
    const expired = base + 61_500;
    harness.chat.handle(
      harness.alice.session,
      { type: "private-chat", to: "Bob", text: "back" },
      expired,
    );
    harness.parties.handle(
      harness.alice.session,
      { type: "party-chat", text: "back" },
      expired,
    );
    harness.guilds.handle(
      harness.alice.session,
      { type: "guild-chat", text: "back" },
      expired,
    );
    expect(
      harness.bob.sent.some(
        (message) => message.type === "private-chat-delivered",
      ),
    ).toBe(true);
    expect(
      harness.bob.sent.some(
        (message) => message.type === "party-chat-delivered",
      ),
    ).toBe(true);
    expect(
      harness.alice.sent.some(
        (message) => message.type === "guild-chat-delivered",
      ),
    ).toBe(true);
  });

  it("spam flood mutes in one channel apply to every other channel", async () => {
    const harness = makeHarness();
    const base = Date.now();
    formParty(harness, base);

    // Overflow the local-chat message buffer (capacity 4) within one tick.
    const flooding = base + 3_000;
    for (let index = 0; index < 5; index += 1) {
      harness.chat.handle(
        harness.alice.session,
        { type: "speak", mode: "say", text: `line ${index}` },
        flooding,
      );
    }
    const floodRejections = rejectionsOf(harness.alice);
    expect(floodRejections.length).toBeGreaterThan(0);

    // The auto-mute now gates party chat too, not just local chat.
    harness.parties.handle(
      harness.alice.session,
      { type: "party-chat", text: "still here?" },
      flooding + 1_000,
    );
    expect(
      harness.bob.sent.some(
        (message) => message.type === "party-chat-delivered",
      ),
    ).toBe(false);
    expect(rejectionsOf(harness.alice).length).toBeGreaterThan(
      floodRejections.length,
    );
  });

  it("moderation commands are speech, not commands, without the dev GM handler", () => {
    const harness = makeHarness();
    const base = Date.now();
    harness.chat.handle(
      harness.alice.session,
      { type: "speak", mode: "say", text: "/mute Bob 5 spam" },
      base,
    );
    // The slash text broadcast as ordinary speech and no action was applied.
    expect(
      harness.alice.sent.some(
        (message) =>
          message.type === "creature-spoke" &&
          message.text === "/mute Bob 5 spam",
      ),
    ).toBe(true);
    expect(harness.store.actions).toHaveLength(0);
    expect(harness.moderation.muteRemainingMs(B, base + 1)).toBe(0);
  });
});
