import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { Position, ServerMessage } from "@tibia/protocol";
import { ChatHandler } from "./ChatHandler";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";

const VIEW_RANGE = { x: 9, y: 7 };

interface TestPeer {
  player: Player;
  session: Session;
  messages: ServerMessage[];
}

const makeHarness = () => {
  const world = new World(
    gridMapData({
      name: "chat-grid",
      width: 80,
      height: 60,
      blocked: [],
      groundSpeed: 50,
      floors: [7, 8],
    }),
    25,
  );
  const registry = new SessionRegistry();
  const visibility = new Visibility(world, registry);
  const chat = new ChatHandler(world, registry, visibility);

  const join = (name: string, position: Position, level = 1): TestPeer => {
    const character = {
      ...makeCharacter(`id-${name.toLowerCase().replace(/ /g, "-")}`, name),
      level,
      experience: BigInt(getExperienceForLevel(level)),
    };
    const player = new Player(character, position);
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
      initialViewRange: VIEW_RANGE,
    });
    session.playerId = player.id;
    world.addPlayer(player);
    registry.add(session);
    registry.bindPlayer(session);
    visibility.announceSpawn(session, player);
    messages.length = 0;
    return { player, session, messages };
  };

  const say = (peer: TestPeer, text: string, now = 1_000) =>
    chat.handle(peer.session, { type: "speak", mode: "say", text }, now);

  return { chat, join, say };
};

const spokenTo = (peer: TestPeer) =>
  peer.messages.filter((message) => message.type === "creature-spoke");

const rejectionsTo = (peer: TestPeer) =>
  peer.messages.filter((message) => message.type === "chat-rejected");

describe("ChatHandler local speech", () => {
  it("routes say to viewers only, with the speaker name taken from the session", () => {
    const { chat, join } = makeHarness();
    const speaker = join("Speaker", { x: 30, y: 30, z: 7 });
    const near = join("Near", { x: 35, y: 30, z: 7 });
    const outOfRange = join("Far", { x: 60, y: 30, z: 7 });
    const wrongFloor = join("Below", { x: 30, y: 30, z: 8 });

    chat.handle(
      speaker.session,
      { type: "speak", mode: "say", text: "hello world" },
      1_000,
    );

    expect(spokenTo(near)).toEqual([
      {
        type: "creature-spoke",
        creatureId: speaker.player.id,
        name: "Speaker",
        mode: "say",
        position: { x: 30, y: 30, z: 7 },
        text: "hello world",
      },
    ]);
    expect(spokenTo(speaker)).toHaveLength(1);
    expect(spokenTo(outOfRange)).toEqual([]);
    expect(spokenTo(wrongFloor)).toEqual([]);
  });

  it("drops whitespace-only speech without routing anything", () => {
    const { chat, join } = makeHarness();
    const speaker = join("Speaker", { x: 30, y: 30, z: 7 });
    const near = join("Near", { x: 31, y: 30, z: 7 });
    speaker.messages.length = 0;
    near.messages.length = 0;

    chat.handle(
      speaker.session,
      { type: "speak", mode: "say", text: "   " },
      1_000,
    );

    expect(near.messages).toEqual([]);
    expect(speaker.messages).toEqual([]);
  });

  it("muffles whisper beyond one tile to pspsps", () => {
    const { chat, join } = makeHarness();
    const speaker = join("Speaker", { x: 30, y: 30, z: 7 });
    const adjacent = join("Adjacent", { x: 31, y: 31, z: 7 });
    const onScreen = join("On Screen", { x: 34, y: 30, z: 7 });

    chat.handle(
      speaker.session,
      { type: "speak", mode: "whisper", text: "secret plan" },
      1_000,
    );

    expect(spokenTo(adjacent)[0]).toMatchObject({ text: "secret plan" });
    expect(spokenTo(onScreen)[0]).toMatchObject({
      mode: "whisper",
      text: "pspsps",
    });
  });

  it("requires a joined character before speaking", () => {
    const { chat, join } = makeHarness();
    const peer = join("Speaker", { x: 30, y: 30, z: 7 });
    peer.session.playerId = null;

    chat.handle(
      peer.session,
      { type: "speak", mode: "say", text: "hello" },
      1_000,
    );

    expect(peer.messages).toEqual([
      { type: "error", code: "join-required" },
    ]);
  });
});

describe("ChatHandler yell", () => {
  it("uppercases yells and reaches beyond normal view range", () => {
    const { chat, join } = makeHarness();
    const speaker = join("Speaker", { x: 30, y: 30, z: 7 }, 2);
    const distant = join("Distant", { x: 45, y: 30, z: 7 });

    chat.handle(
      speaker.session,
      { type: "speak", mode: "yell", text: "help me" },
      1_000,
    );

    expect(spokenTo(distant)).toEqual([
      expect.objectContaining({ mode: "yell", text: "HELP ME" }),
    ]);
  });

  it("enforces the 30 second yell exhaust server-side", () => {
    const { chat, join } = makeHarness();
    const speaker = join("Speaker", { x: 30, y: 30, z: 7 }, 2);

    chat.handle(
      speaker.session,
      { type: "speak", mode: "yell", text: "first" },
      1_000,
    );
    chat.handle(
      speaker.session,
      { type: "speak", mode: "yell", text: "second" },
      10_000,
    );

    expect(rejectionsTo(speaker)).toEqual([
      { type: "chat-rejected", reason: "yell-exhausted", retryAfterMs: 21_000 },
    ]);
    expect(
      spokenTo(speaker).filter((message) => message.text === "SECOND"),
    ).toEqual([]);
  });

  it("refuses yelling on level 1", () => {
    const { chat, join } = makeHarness();
    const speaker = join("Speaker", { x: 30, y: 30, z: 7 }, 1);

    chat.handle(
      speaker.session,
      { type: "speak", mode: "yell", text: "hello" },
      1_000,
    );

    expect(rejectionsTo(speaker)).toEqual([
      { type: "chat-rejected", reason: "level-too-low" },
    ]);
    expect(spokenTo(speaker)).toEqual([]);
  });
});

describe("ChatHandler flood control", () => {
  it("mutes after the burst allowance with escalating durations", () => {
    const { join, say } = makeHarness();
    const speaker = join("Spammer", { x: 30, y: 30, z: 7 });

    for (let index = 0; index < 5; index++) say(speaker, `spam ${index}`, 0);

    expect(spokenTo(speaker)).toHaveLength(4);
    expect(rejectionsTo(speaker)).toEqual([
      { type: "chat-rejected", reason: "muted", retryAfterMs: 5_000 },
    ]);

    // still muted, keyed by character id — a fresh session cannot evade it
    say(speaker, "still there?", 1_000);
    expect(rejectionsTo(speaker).at(-1)).toEqual({
      type: "chat-rejected",
      reason: "muted",
      retryAfterMs: 4_000,
    });

    // second offence escalates to 5 * 2^2 = 20 seconds
    for (let index = 0; index < 5; index++) say(speaker, "again", 10_000);
    expect(rejectionsTo(speaker).at(-1)).toEqual({
      type: "chat-rejected",
      reason: "muted",
      retryAfterMs: 20_000,
    });
  });

  it("regains one message slot per 1.5 seconds instead of a fixed window", () => {
    const { join, say } = makeHarness();
    const speaker = join("Chatty", { x: 30, y: 30, z: 7 });

    for (let index = 0; index < 4; index++) say(speaker, "burst", 0);
    say(speaker, "one more", 1_500);

    expect(rejectionsTo(speaker)).toEqual([]);
    expect(spokenTo(speaker)).toHaveLength(5);
  });
});

describe("ChatHandler private messages", () => {
  it("delivers both legs by case-insensitive name without leaking position", () => {
    const { chat, join } = makeHarness();
    const sender = join("Sender", { x: 5, y: 5, z: 7 });
    const recipient = join("Recipient", { x: 70, y: 50, z: 8 });
    const bystander = join("Bystander", { x: 6, y: 5, z: 7 });

    chat.handle(
      sender.session,
      { type: "private-chat", to: "rEcIpIeNt", text: "meet me" },
      1_000,
    );

    expect(
      recipient.messages.filter(
        (message) => message.type === "private-chat-delivered",
      ),
    ).toEqual([
      {
        type: "private-chat-delivered",
        direction: "incoming",
        counterpart: "Sender",
        text: "meet me",
      },
    ]);
    expect(
      sender.messages.filter(
        (message) => message.type === "private-chat-delivered",
      ),
    ).toEqual([
      {
        type: "private-chat-delivered",
        direction: "outgoing",
        counterpart: "Recipient",
        text: "meet me",
      },
    ]);
    expect(bystander.messages).toEqual([]);
  });

  it("rejects messages to offline names with no other detail", () => {
    const { chat, join } = makeHarness();
    const sender = join("Sender", { x: 5, y: 5, z: 7 });

    chat.handle(
      sender.session,
      { type: "private-chat", to: "Nobody Here", text: "hello?" },
      1_000,
    );

    expect(sender.messages).toEqual([
      { type: "chat-rejected", reason: "recipient-offline" },
    ]);
  });

  it("counts offline probes against the flood budget", () => {
    const { chat, join } = makeHarness();
    const prober = join("Prober", { x: 5, y: 5, z: 7 });

    for (let index = 0; index < 5; index++) {
      chat.handle(
        prober.session,
        { type: "private-chat", to: `Guess ${index}`, text: "hi" },
        0,
      );
    }

    expect(rejectionsTo(prober).at(-1)).toEqual({
      type: "chat-rejected",
      reason: "muted",
      retryAfterMs: 5_000,
    });
  });
});
