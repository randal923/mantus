import { describe, expect, it, vi } from "vitest";
import {
  CHAT_CHANNEL_IDS,
  clientMessageSchema,
  type Position,
  type ServerMessage,
} from "@tibia/protocol";
import type { WebSocket } from "ws";
import { ChatChannelRegistry } from "./ChatChannelRegistry";
import { ChatHandler } from "./ChatHandler";
import { TalkactionRegistry } from "./TalkactionRegistry";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";

interface TestPeer {
  player: Player;
  session: Session;
  messages: ServerMessage[];
}

function makeHarness() {
  const world = new World(
    gridMapData({ name: "channels", width: 60, height: 40, blocked: [] }),
    25,
  );
  const registry = new SessionRegistry();
  const visibility = new Visibility(world, registry);
  const chat = new ChatHandler(
    world,
    registry,
    visibility,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => ({
      uptimeMs: 3_720_000,
      onlinePlayerCount: 7,
      experienceRate: 3,
      lootRate: 2,
    }),
  );
  let nextX = 10;
  const join = (
    name: string,
    position: Position = { x: nextX++, y: 10, z: 7 },
    level = 8,
  ): TestPeer => {
    const player = new Player(
      {
        ...makeCharacter(`id-${name.toLowerCase()}`, name),
        level,
        experience: BigInt(getExperienceForLevel(level)),
      },
      position,
    );
    const messages: ServerMessage[] = [];
    const socket = {
      on: vi.fn(),
      readyState: 1,
      OPEN: 1,
      send: (data: string) => {
        messages.push(JSON.parse(data) as ServerMessage);
      },
    } as unknown as WebSocket;
    const session = new Session(`session-${name}`, "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });
    session.playerId = player.id;
    world.addPlayer(player);
    registry.add(session);
    registry.bindPlayer(session);
    visibility.announceSpawn(session, player);
    messages.length = 0;
    return { player, session, messages };
  };
  const open = (peer: TestPeer, channelId: "help" | "game-chat" | "trade") =>
    chat.handle(
      peer.session,
      { type: "channel-open", channelId },
      1_000,
    );
  return { chat, join, open, world };
}

const channelLines = (peer: TestPeer) =>
  peer.messages.filter((message) => message.type === "channel-message");

describe("public chat channels", () => {
  it("delivers only to current subscribers", () => {
    const harness = makeHarness();
    const speaker = harness.join("Speaker");
    const member = harness.join("Member");
    const outsider = harness.join("Outsider");
    for (const peer of [speaker, member, outsider]) peer.messages.length = 0;
    harness.open(speaker, "trade");
    harness.open(member, "trade");

    harness.chat.handle(
      speaker.session,
      { type: "channel-speak", channelId: "trade", text: "selling boots" },
      2_000,
    );

    expect(channelLines(member)).toEqual([
      {
        type: "channel-message",
        channelId: "trade",
        speakerId: speaker.player.id,
        speakerName: "Speaker",
        text: "selling boots",
      },
    ]);
    expect(channelLines(outsider)).toEqual([]);
  });

  it("refuses a channel the session never opened", () => {
    const harness = makeHarness();
    const speaker = harness.join("Speaker");

    harness.chat.handle(
      speaker.session,
      { type: "channel-speak", channelId: "trade", text: "hello" },
      1_000,
    );

    expect(speaker.messages.at(-1)).toEqual({
      type: "chat-rejected",
      reason: "channel-not-open",
    });
  });

  it("stops delivering the moment a member stops qualifying", () => {
    const harness = makeHarness();
    const speaker = harness.join("Speaker");
    const member = harness.join("Member", { x: 21, y: 10, z: 7 }, 8);
    member.messages.length = 0;
    harness.open(speaker, "help");
    harness.open(member, "help");

    // Membership is re-evaluated per line: the level-2 floor on Help is
    // checked again here, not at subscribe time.
    harness.world.removePlayer(member.player.id);
    harness.chat.handle(
      speaker.session,
      { type: "channel-speak", channelId: "help", text: "anyone?" },
      2_000,
    );

    expect(channelLines(member)).toEqual([]);
  });

  it("refuses to open a channel the character does not qualify for", () => {
    const harness = makeHarness();
    const rookie = harness.join("Rookie", { x: 32, y: 10, z: 7 }, 1);
    rookie.messages.length = 0;

    harness.open(rookie, "help");

    expect(rookie.messages.at(-1)).toEqual({
      type: "chat-rejected",
      reason: "channel-not-open",
    });
  });

  it("lists the channels a character may open with their state", () => {
    const harness = makeHarness();
    const rookie = harness.join("Rookie", { x: 34, y: 10, z: 7 }, 1);
    harness.open(rookie, "trade");

    harness.chat.handle(
      rookie.session,
      { type: "channel-list-get" },
      1_000,
    );

    const list = harness.chat && rookie.messages.at(-2);
    expect(list).toMatchObject({
      type: "channel-list",
      channels: [
        { id: "game-chat", open: false },
        { id: "trade", open: true },
      ],
    });
  });
});

describe("ignore lists", () => {
  it("suppresses an ignored speaker everywhere without telling them", () => {
    const harness = makeHarness();
    const pest = harness.join("Pest");
    const victim = harness.join("Victim", { x: 11, y: 10, z: 7 });
    harness.open(pest, "trade");
    harness.open(victim, "trade");
    harness.chat.handle(
      victim.session,
      { type: "ignore-add", name: "Pest" },
      1_000,
    );
    victim.messages.length = 0;
    pest.messages.length = 0;

    harness.chat.handle(
      pest.session,
      { type: "speak", mode: "say", text: "hello" },
      2_000,
    );
    harness.chat.handle(
      pest.session,
      { type: "channel-speak", channelId: "trade", text: "buying" },
      2_100,
    );
    harness.chat.handle(
      pest.session,
      { type: "private-chat", to: "Victim", text: "psst" },
      2_200,
    );

    expect(victim.messages).toEqual([]);
    // The ignored speaker sees their own line and the ordinary outgoing echo,
    // and never learns that nothing was delivered.
    expect(pest.messages).toContainEqual(
      expect.objectContaining({
        type: "private-chat-delivered",
        direction: "outgoing",
        counterpart: "Victim",
      }),
    );
    expect(
      pest.messages.some((message) => message.type === "chat-rejected"),
    ).toBe(false);
  });

  it("echoes the list back and forgets a removed name", () => {
    const harness = makeHarness();
    const victim = harness.join("Victim");

    harness.chat.handle(
      victim.session,
      { type: "ignore-add", name: "Pest" },
      1_000,
    );
    expect(victim.messages.at(-1)).toEqual({
      type: "ignore-list",
      names: ["pest"],
    });

    harness.chat.handle(
      victim.session,
      { type: "ignore-remove", name: "Pest" },
      1_100,
    );
    expect(victim.messages.at(-1)).toEqual({
      type: "ignore-list",
      names: [],
    });
  });
});

describe("talkactions", () => {
  it("answers the caller and never broadcasts the words", () => {
    const harness = makeHarness();
    const caller = harness.join("Caller");
    const bystander = harness.join("Bystander", { x: 11, y: 10, z: 7 });
    caller.messages.length = 0;
    bystander.messages.length = 0;

    harness.chat.handle(
      caller.session,
      { type: "speak", mode: "say", text: "!uptime" },
      1_000,
    );

    expect(caller.messages).toEqual([
      {
        type: "server-notice",
        category: "talkaction",
        text: "Server uptime: 1h 2m.",
      },
    ]);
    expect(bystander.messages).toEqual([]);
  });

  it("reports only server-wide facts and the caller's own state", () => {
    const harness = makeHarness();
    const caller = harness.join("Caller", { x: 30, y: 10, z: 7 }, 12);
    caller.messages.length = 0;

    for (const word of ["!online", "!serverinfo", "!exp"]) {
      harness.chat.handle(
        caller.session,
        { type: "speak", mode: "say", text: word },
        1_000,
      );
    }

    expect(
      caller.messages.map((message) =>
        message.type === "server-notice" ? message.text : message.type,
      ),
    ).toEqual([
      "There are 7 characters online.",
      "Experience rate: 3x. Loot rate: 2x.",
      `You are level 12 with ${getExperienceForLevel(12)} experience.`,
    ]);
  });
});

/**
 * The parity inventory for the player-visible chat surface: every registered
 * channel and talkaction must be backed by an implementation and reachable
 * through a bounded schema. A registered entry with no owner fails here.
 */
describe("chat parity inventory", () => {
  it("owns every registered channel", () => {
    const registry = new ChatChannelRegistry();

    expect(registry.all().map((channel) => channel.id).sort()).toEqual(
      [...CHAT_CHANNEL_IDS].sort(),
    );
    for (const channel of registry.all()) {
      expect(channel.label.length).toBeGreaterThan(0);
      expect(typeof channel.canJoin).toBe("function");
      expect(
        clientMessageSchema.safeParse({
          type: "channel-speak",
          channelId: channel.id,
          text: "hello",
        }).success,
      ).toBe(true);
    }
    // An unregistered id cannot even be expressed by the protocol.
    expect(
      clientMessageSchema.safeParse({
        type: "channel-speak",
        channelId: "rule-violations",
        text: "hello",
      }).success,
    ).toBe(false);
  });

  it("owns every registered talkaction", () => {
    const talkactions = new TalkactionRegistry();

    expect(talkactions.all().map((entry) => entry.word)).toEqual([
      "!uptime",
      "!online",
      "!serverinfo",
      "!exp",
    ]);
    for (const entry of talkactions.all()) {
      expect(entry.word.startsWith("!")).toBe(true);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(talkactions.match(entry.word.toUpperCase())).toBe(entry);
    }
    expect(talkactions.match("!notathing")).toBeUndefined();
  });

  it("bounds every chat intent it accepts", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "channel-speak",
        channelId: "trade",
        text: "x".repeat(256),
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "channel-speak",
        channelId: "trade",
        text: "hi",
        speakerName: "Someone Else",
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: "ignore-add", name: "ab" }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({ type: "channel-list-get" }).success,
    ).toBe(true);
  });
});
