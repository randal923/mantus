import { describe, expect, it, vi } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { Npc } from "../creature/Npc";
import type { NpcType } from "../creature/NpcType";
import type { BankService } from "../economy/BankService";
import type { ShopService } from "../economy/ShopService";
import { gridMapData } from "../gridMapData";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { Player } from "../Player";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { makeNpcType } from "../test/makeNpcType";
import { Visibility } from "../Visibility";
import { World } from "../World";
import type { DialogueGraph, DialogueNode } from "./DialogueGraph";
import { NpcHandler } from "./NpcHandler";
import { SpellTeacherService } from "./SpellTeacherService";
import type {
  LearnSpellCommitResult,
  SpellTeacherStore,
} from "./SpellTeacherStore";
import { learnedSpellStorageKey } from "./SpellTeacherStore";
import type { TravelService } from "./TravelService";

const NPC_POSITION: Position = { x: 12, y: 12, z: 7 };
const PLAYER_POSITION: Position = { x: 13, y: 12, z: 7 };
const SPELL_KEY = learnedSpellStorageKey("exura");

function graphWith(nodes: ReadonlyArray<DialogueNode>): DialogueGraph {
  return {
    talkRange: 4,
    timeoutMs: 30_000,
    greetingKeywords: ["hi"],
    farewellKeywords: ["bye"],
    greeting: ["Hello."],
    farewell: ["Bye."],
    walkAway: ["Bye."],
    rootNodeId: "root",
    nodes: [
      {
        id: "root",
        matches: [],
        responses: [],
        children: nodes.map((node) => node.id),
        choices: nodes.map((node) => ({ nodeId: node.id, label: node.id })),
      },
      ...nodes,
    ],
    travelOffers: [],
  };
}

function makeHarness(graph: DialogueGraph, store?: SpellTeacherStore) {
  const world = new World(
    gridMapData({
      name: "npc-commands",
      width: 40,
      height: 40,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const registry = new SessionRegistry();
  const visibility = new Visibility(world, registry);
  const persistence = {
    beginExternalMutation: vi.fn(() => Promise.resolve(1)),
    completeExternalMutation: vi.fn(),
    cancelExternalMutation: vi.fn(),
    saveNow: vi.fn(),
  } as unknown as CharacterPersistence;
  const items = {
    applyCommittedMutation: vi.fn(),
    trackExternalOperation: vi.fn(),
  } as unknown as ItemIntentHandler;
  const spellTeacher = new SpellTeacherService(
    world,
    persistence,
    items,
    store,
  );
  const handler = new NpcHandler(
    world,
    registry,
    visibility,
    { start: vi.fn(() => "unavailable" as const) } as unknown as TravelService,
    { open: vi.fn(() => "unavailable" as const) } as unknown as BankService,
    {
      open: vi.fn(() => "unavailable" as const),
      close: vi.fn(),
    } as unknown as ShopService,
    undefined,
    spellTeacher,
  );
  const player = new Player(makeCharacter("learner", "Learner"), PLAYER_POSITION);
  const messages: ServerMessage[] = [];
  const socket = {
    on: vi.fn(),
    readyState: 1,
    OPEN: 1,
    send: (data: string) => messages.push(JSON.parse(data) as ServerMessage),
  } as unknown as WebSocket;
  const session = new Session("session-learner", "127.0.0.1", socket, {
    maxPendingIntents: 16,
    maxProtocolViolations: 5,
    initialViewRange: { x: 9, y: 7 },
  });
  session.playerId = player.id;
  world.addPlayer(player);
  registry.add(session);
  registry.bindPlayer(session);
  visibility.announceSpawn(session, player);
  const type: NpcType = makeNpcType({ id: "teacher", name: "Teacher", dialogue: graph });
  const npc = new Npc({
    id: "npc-teacher",
    type,
    position: NPC_POSITION,
    home: NPC_POSITION,
    direction: "south",
    spawnRadius: 0,
  });
  world.addCreature(npc);
  visibility.announceSpawn(session, player);
  messages.length = 0;
  const say = (text: string, now = 0) => {
    handler.handleSpeech(player, text, now);
    return messages;
  };
  return { handler, player, session, messages, npc, spellTeacher, say };
}

const texts = (messages: ReadonlyArray<ServerMessage>): string[] =>
  messages.flatMap((message) =>
    message.type === "npc-dialogue" ? [message.text] : [],
  );

describe("typed NPC commands", () => {
  it("buys a spell through one atomic store commit and grants it in memory", async () => {
    const commits: unknown[] = [];
    const store: SpellTeacherStore = {
      commit: (characterId, version, spellId, minimumLevel, price, npcTypeId) => {
        commits.push({ characterId, version, spellId, minimumLevel, price, npcTypeId });
        return Promise.resolve<LearnSpellCommitResult>({
          status: "committed",
          characterVersion: version + 1,
          storageKey: SPELL_KEY,
          mutation: { after: [], removedItemIds: [] },
        });
      },
    };
    const harness = makeHarness(
      graphWith([
        {
          id: "buy",
          matches: [["yes"]],
          responses: ["You have learned 'Light Healing'."],
          children: [],
          choices: [],
          nextNodeId: "root",
          action: {
            kind: "learn-spell",
            spellId: "exura",
            price: 200,
            minimumLevel: 1,
            premium: false,
          },
        },
      ]),
      store,
    );
    harness.say("hi");
    harness.messages.length = 0;
    harness.say("yes");

    await harness.spellTeacher.stop();
    harness.spellTeacher.applyResolvedOutcomes(1);

    expect(commits).toEqual([
      {
        characterId: harness.player.id,
        version: 1,
        spellId: "exura",
        minimumLevel: 1,
        price: 200,
        npcTypeId: "teacher",
      },
    ]);
    expect(harness.player.storageValue(SPELL_KEY)).toBe(1);
    expect(texts(harness.messages)).toContain("You have learned 'Light Healing'.");
  });

  it("refuses a second purchase of a spell already granted", () => {
    const store: SpellTeacherStore = { commit: vi.fn() };
    const harness = makeHarness(
      graphWith([
        {
          id: "buy",
          matches: [["yes"]],
          responses: ["Learned."],
          children: [],
          choices: [],
          nextNodeId: "root",
          action: {
            kind: "learn-spell",
            spellId: "exura",
            price: 200,
            minimumLevel: 1,
            premium: false,
          },
        },
      ]),
      store,
    );
    harness.player.setStorageValue(SPELL_KEY, 1);
    harness.say("hi");
    harness.messages.length = 0;
    harness.say("yes");

    expect(store.commit).not.toHaveBeenCalled();
    expect(texts(harness.messages)).toContain("You already know this spell.");
  });

  it("re-checks a storage condition at execution time, not when offered", () => {
    const harness = makeHarness(
      graphWith([
        {
          id: "gated",
          matches: [["mission"]],
          responses: ["Take this mission."],
          children: [],
          choices: [],
          nextNodeId: "root",
          conditions: [
            {
              kind: "storage",
              key: "Quest.Example.Mission",
              operator: "eq",
              value: -1,
            },
          ],
          effects: [
            { kind: "set-storage", key: "Quest.Example.Mission", value: 1 },
          ],
        },
      ]),
    );
    harness.say("hi");
    harness.messages.length = 0;

    harness.say("mission");
    expect(texts(harness.messages)).toContain("Take this mission.");
    expect(harness.player.storageValue("Quest.Example.Mission")).toBe(1);

    // The branch is still offered, but the state it required has changed.
    harness.messages.length = 0;
    harness.say("mission");
    expect(texts(harness.messages)).toContain(
      "I cannot help you with that right now.",
    );
  });

  it("applies a hint action's counter and wraps at the end", () => {
    const harness = makeHarness(
      graphWith([
        {
          id: "hints",
          matches: [["hints"]],
          responses: [],
          children: [],
          choices: [],
          nextNodeId: "root",
          action: {
            kind: "hint",
            storageKey: "RookgaardHints",
            hints: [["first"], ["second", "and more"]],
          },
        },
      ]),
    );
    harness.say("hi");
    harness.messages.length = 0;

    harness.say("hints");
    expect(texts(harness.messages)).toEqual(["first"]);
    expect(harness.player.storageValue("RookgaardHints")).toBe(1);

    harness.messages.length = 0;
    harness.say("hints");
    expect(texts(harness.messages)).toEqual(["second", "and more"]);
    expect(harness.player.storageValue("RookgaardHints")).toBe(0);
  });

  it("ends the conversation after an ungreet line", () => {
    const harness = makeHarness(
      graphWith([
        {
          id: "decline",
          matches: [["no"]],
          responses: ["Come back if you change your mind."],
          children: [],
          choices: [],
          nextNodeId: "root",
          ungreet: true,
        },
      ]),
    );
    harness.say("hi");
    harness.messages.length = 0;
    harness.say("no");
    expect(texts(harness.messages)).toContain(
      "Come back if you change your mind.",
    );

    // The NPC dropped focus: an in-conversation keyword no longer answers.
    harness.messages.length = 0;
    harness.say("no");
    expect(texts(harness.messages)).toEqual([]);
  });
});
