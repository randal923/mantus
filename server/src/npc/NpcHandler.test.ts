import { randomUUID } from "node:crypto";
import type { Position, ServerMessage } from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { Npc } from "../creature/Npc";
import type { NpcType } from "../creature/NpcType";
import type { BankService } from "../economy/BankService";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { DialogueGraph } from "./DialogueGraph";
import { NpcHandler } from "./NpcHandler";
import type { TravelService } from "./TravelService";

const dialogue: DialogueGraph = {
  talkRange: 4,
  timeoutMs: 1_000,
  greetingKeywords: ["hi"],
  farewellKeywords: ["bye"],
  greeting: ["Hello, |PLAYERNAME|."],
  farewell: ["Good bye."],
  walkAway: ["Come back later."],
  rootNodeId: "root",
  nodes: [
    {
      id: "root",
      matches: [],
      responses: [],
      children: ["information"],
      choices: [{ nodeId: "information", label: "Information" }],
    },
    {
      id: "information",
      matches: [["information"]],
      responses: ["This is private information."],
      children: [],
      choices: [],
      nextNodeId: "root",
    },
  ],
  travelOffers: [],
};

const npcType: NpcType = {
  id: "guide",
  name: "Guide",
  outfit: { lookType: 57, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
  health: 100,
  maxHealth: 100,
  speed: 100,
  walkIntervalMs: 2_000,
  walkRadius: 2,
  dialogue,
};

interface TestPeer {
  player: Player;
  session: Session;
  messages: ServerMessage[];
}

const makeHarness = () => {
  const world = new World(
    gridMapData({
      name: "npc-test",
      width: 40,
      height: 40,
      blocked: [],
      floors: [7, 8],
    }),
    25,
  );
  const registry = new SessionRegistry();
  const visibility = new Visibility(world, registry);
  const travel = {
    start: vi.fn(() => "unavailable" as const),
  } as unknown as TravelService;
  const bank = {
    open: vi.fn(() => "unavailable" as const),
  } as unknown as BankService;
  const handler = new NpcHandler(world, registry, visibility, travel, bank);

  const join = (id: string, position: Position): TestPeer => {
    const player = new Player(makeCharacter(id, id), position);
    const messages: ServerMessage[] = [];
    const socket = {
      on: vi.fn(),
      readyState: 1,
      OPEN: 1,
      send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
    } as unknown as WebSocket;
    const session = new Session(`session-${id}`, "127.0.0.1", socket, {
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

  const addNpc = (id: string, position: Position): Npc => {
    const npc = new Npc({
      id,
      type: npcType,
      position,
      direction: "south",
      home: position,
      spawnRadius: 2,
    });
    world.addCreature(npc);
    visibility.announceCreatureSpawn(npc);
    return npc;
  };

  return { world, registry, handler, join, addNpc };
};

const dialogueMessages = (peer: TestPeer) =>
  peer.messages.filter((message) => message.type === "npc-dialogue");

describe("NpcHandler", () => {
  it("keeps dialogue and offered choices private to the relevant player", () => {
    const { handler, join, addNpc } = makeHarness();
    const speaker = join("speaker", { x: 10, y: 10, z: 7 });
    const observer = join("observer", { x: 12, y: 10, z: 7 });
    const npc = addNpc("npc-guide", { x: 10, y: 12, z: 7 });
    speaker.messages.length = 0;
    observer.messages.length = 0;

    handler.handleSpeech(speaker.player, "hi", 1_000);

    const greeting = dialogueMessages(speaker)[0];
    expect(greeting).toMatchObject({
      npcId: npc.id,
      text: "Hello, speaker.",
      options: [
        { id: "information", label: "Information" },
        { id: "farewell", label: "Bye" },
      ],
    });
    expect(dialogueMessages(observer)).toEqual([]);
    expect(npc.isInConversation).toBe(true);

    if (!greeting) throw new Error("NPC greeting is missing");
    handler.handleChoice(
      observer.session,
      {
        type: "npc-dialogue-choice",
        npcId: npc.id,
        conversationId: greeting.conversationId,
        choiceId: "information",
      },
      1_100,
    );
    expect(dialogueMessages(observer)).toEqual([]);
  });

  it("ignores forged choices, cross-NPC conversation ids, and replayed state", () => {
    const { handler, join, addNpc } = makeHarness();
    const speaker = join("speaker", { x: 10, y: 10, z: 7 });
    const npc = addNpc("npc-guide", { x: 10, y: 12, z: 7 });
    const otherNpc = addNpc("npc-other", { x: 30, y: 30, z: 7 });
    speaker.messages.length = 0;
    handler.handleSpeech(speaker.player, "hi", 1_000);
    const greeting = dialogueMessages(speaker)[0];
    if (!greeting) throw new Error("NPC greeting is missing");
    speaker.messages.length = 0;

    handler.handleChoice(
      speaker.session,
      {
        type: "npc-dialogue-choice",
        npcId: npc.id,
        conversationId: randomUUID(),
        choiceId: "information",
      },
      1_100,
    );
    handler.handleChoice(
      speaker.session,
      {
        type: "npc-dialogue-choice",
        npcId: otherNpc.id,
        conversationId: greeting.conversationId,
        choiceId: "information",
      },
      1_100,
    );
    handler.handleChoice(
      speaker.session,
      {
        type: "npc-dialogue-choice",
        npcId: npc.id,
        conversationId: greeting.conversationId,
        choiceId: "unoffered-action",
      },
      1_100,
    );
    expect(dialogueMessages(speaker)).toEqual([]);

    handler.handleChoice(
      speaker.session,
      {
        type: "npc-dialogue-choice",
        npcId: npc.id,
        conversationId: greeting.conversationId,
        choiceId: "information",
      },
      1_100,
    );
    expect(dialogueMessages(speaker)).toMatchObject([
      { text: "This is private information." },
    ]);

    handler.handleChoice(
      speaker.session,
      {
        type: "npc-dialogue-choice",
        npcId: npc.id,
        conversationId: greeting.conversationId,
        choiceId: "farewell",
      },
      1_200,
    );
    const messageCount = speaker.messages.length;
    handler.handleChoice(
      speaker.session,
      {
        type: "npc-dialogue-choice",
        npcId: npc.id,
        conversationId: greeting.conversationId,
        choiceId: "information",
      },
      1_300,
    );
    expect(speaker.messages).toHaveLength(messageCount);
  });

  it("closes state after range, floor, timeout, and logout cleanup", () => {
    const { world, handler, join, addNpc } = makeHarness();
    const speaker = join("speaker", { x: 10, y: 10, z: 7 });
    const npc = addNpc("npc-guide", { x: 10, y: 12, z: 7 });
    speaker.messages.length = 0;
    handler.handleSpeech(speaker.player, "hi", 1_000);
    world.relocateCreature(speaker.player, { x: 20, y: 20, z: 7 });
    handler.tick(1_100);
    expect(speaker.messages.at(-1)).toMatchObject({
      type: "npc-dialogue-closed",
      reason: "walked-away",
    });
    expect(npc.isInConversation).toBe(false);

    world.relocateCreature(speaker.player, { x: 10, y: 10, z: 7 });
    handler.handleSpeech(speaker.player, "hi", 2_000);
    handler.tick(3_000);
    expect(speaker.messages.at(-1)).toMatchObject({
      type: "npc-dialogue-closed",
      reason: "timed-out",
    });

    handler.handleSpeech(speaker.player, "hi", 4_000);
    expect(npc.isInConversation).toBe(true);
    handler.removePlayer(speaker.player.id);
    expect(npc.isInConversation).toBe(false);

    world.relocateCreature(speaker.player, { x: 10, y: 10, z: 8 });
    const messageCount = speaker.messages.length;
    handler.handleSpeech(speaker.player, "hi", 5_000);
    expect(speaker.messages).toHaveLength(messageCount);
  });
});
