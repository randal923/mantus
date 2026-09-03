import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createDefaultActionBar,
  parseServerMessages,
  type ServerMessage,
} from "@tibia/protocol";
import { DEFAULT_CHAT_FLOOD_LIMITS } from "./chat/ChatFloodLimits";
import type { ServerConfig } from "./config";
import { GameServer } from "./GameServer";
import type { ItemCatalog } from "./item/ItemCatalog";
import { loadItemCatalog } from "./item/loadItemCatalog";
import { MemoryItemStore } from "./item/MemoryItemStore";
import { NO_STAGES } from "./progression/stageRates";
import { DISABLED_RARITY_CONFIG } from "./rarity/RarityConfig";
import { InMemoryAccountStore } from "./test/InMemoryAccountStore";
import { InMemoryCharacterStore } from "./test/InMemoryCharacterStore";
import { makeCharacter } from "./test/makeCharacter";
import type { TokenVerifier, VerifiedUser } from "./TokenVerifier";

/** Canary's stock exercise sword and the free exercise dummy. */
const EXERCISE_SWORD = 28_552;
const EXERCISE_DUMMY = 28_558;
/** A readable letter: a plain "use" object. */
const LETTER = 3505;
const BACKPACK = 2854;
const GRID = { width: 48, height: 32 };
const STAND = { x: 10, y: 10, z: 7 };
const DUMMY = { x: 10, y: 9, z: 7 };
const CHARACTER_ID = randomUUID();
const BACKPACK_ID = "00000000-0000-4000-8000-000000000101";
const SWORD_ID = "00000000-0000-4000-8000-000000000102";
const LETTER_ID = "00000000-0000-4000-8000-000000000103";
const TOKEN = "tok.trainer";

const config: ServerConfig = {
  port: 0,
  dev: { auth: false, commands: false },
  tickMs: 5,
  heartbeatMs: 30_000,
  authTimeoutMs: 5_000,
  trustProxyHeader: false,
  maxSessions: 10,
  maxLoginQueueSize: 50,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  chat: DEFAULT_CHAT_FLOOD_LIMITS,
  moderationRetentionDays: 365,
  combatSeed: 12345,
  rates: {
    experience: 1,
    skill: 1,
    magic: 1,
    loot: 1,
    spawn: 1,
    soulRegen: 1,
    offlineTraining: 1,
    exerciseTraining: 1,
    bestiaryKills: 1,
    bosstiaryKills: 1,
  },
  rarity: DISABLED_RARITY_CONFIG,
  progression: { staminaSystem: true, stages: NO_STAGES },
  starterTownId: 1,
  characterSaveIntervalMs: 30_000,
  maxCharacterSaveRetries: 3,
  characterSaveRetryDelayMs: 1,
  defaultViewRange: { x: 9, y: 7 },
  map: {
    source: "grid",
    name: "action-bar-item-use-grid",
    ...GRID,
    blocked: [],
    floors: [7],
    groundSpeed: 50,
    protectionZones: [[STAND.x, STAND.y, STAND.z]],
    items: [
      {
        position: DUMMY,
        item: {
          instanceId: "exercise-dummy",
          itemId: EXERCISE_DUMMY,
          stackIndex: 1,
          mutable: false,
        },
      },
    ],
  },
};

const verifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedUser> {
    return { supabaseUserId: `sub-${token}`, email: null };
  },
};

interface TestClient {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
}

/** Authenticates, selects the seeded character and resolves once in the world. */
const connect = (port: number): Promise<TestClient> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    socket.on("open", () =>
      socket.send(JSON.stringify({ type: "auth", token: TOKEN, language: "en" })),
    );
    socket.on("error", reject);
    socket.on("message", (data) => {
      const parsed = parseServerMessages(JSON.parse(data.toString()));
      if (!parsed) {
        reject(new Error("server sent invalid protocol messages"));
        return;
      }
      for (const message of parsed) {
        messages.push(message);
        if (message.type === "auth-ok") {
          socket.send(
            JSON.stringify({
              type: "select-character",
              characterId: CHARACTER_ID,
            }),
          );
        }
        if (message.type === "welcome") resolve({ socket, messages });
      }
    });
  });

const waitFor = async (
  predicate: () => boolean,
  label: string,
  timeoutMs = 5_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

describe("action-bar item use", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  const startServer = () => {
    const accounts = new InMemoryAccountStore();
    accounts.seed({
      id: `acc-sub-${TOKEN}`,
      supabaseUserId: `sub-${TOKEN}`,
      email: null,
      bannedUntil: null,
      role: "player" as const,
      isStaff: false,
      premiumUntil: null,
      mantusCoins: 0,
      language: "en",
      uiSettings: {},
      fightMode: { attack: "offensive", chase: false, secure: true },
    });
    const characters = new InMemoryCharacterStore();
    const actionBar = createDefaultActionBar();
    actionBar[0] = {
      ...actionBar[0]!,
      action: {
        kind: "item",
        itemTypeId: EXERCISE_SWORD,
        mode: "use-with-crosshair",
      },
    };
    actionBar[1] = {
      ...actionBar[1]!,
      action: { kind: "item", itemTypeId: LETTER, mode: "use" },
    };
    characters.seed({
      ...makeCharacter(CHARACTER_ID, "Trainer"),
      accountId: `acc-sub-${TOKEN}`,
      positionX: STAND.x,
      positionY: STAND.y,
      positionZ: STAND.z,
      actionBar,
    });
    const items = new MemoryItemStore(catalog);
    items.seed({
      id: BACKPACK_ID,
      typeId: BACKPACK,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId: CHARACTER_ID,
        slot: "backpack",
      },
    });
    items.seed({
      id: SWORD_ID,
      typeId: EXERCISE_SWORD,
      count: 1,
      attributes: { charges: 500 },
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 0 },
    });
    items.seed({
      id: LETTER_ID,
      typeId: LETTER,
      count: 1,
      attributes: { text: "Read me" },
      version: 1,
      location: { kind: "container", containerId: BACKPACK_ID, slot: 1 },
    });
    server = new GameServer(config, {
      verifier,
      accounts,
      characters,
      items,
      itemCatalog: catalog,
    });
    server.start();
  };

  const join = async (): Promise<TestClient> => {
    const client = await connect(server.port);
    sockets.push(client.socket);
    return client;
  };

  it("starts exercise training from a crosshair button aimed at the dummy", async () => {
    startServer();
    const client = await join();

    client.socket.send(
      JSON.stringify({
        type: "activate-action-bar",
        slotIndex: 0,
        target: { kind: "position", position: DUMMY },
      }),
    );

    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "action-bar-activation-result" &&
            message.slotIndex === 0 &&
            message.accepted,
        ),
      "the button to be accepted",
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "combat-log" &&
            message.text === "You have started training on an exercise dummy.",
        ),
      "training to start",
    );
    // The paid-for hits draw the weapon's charges down; that is what proves
    // the exercise handler, not the generic item path, took the use.
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "inventory-updated" &&
            message.inventory.items.some(
              (entry) =>
                entry.item.id === SWORD_ID &&
                (entry.item.tooltip.charges ?? 500) < 500,
            ),
        ),
      "a charge to be spent",
      10_000,
    );
  }, 15_000);

  it("gates plain-use buttons behind the same 200 ms exhaust as inventory clicks", async () => {
    startServer();
    const client = await join();

    client.socket.send(
      JSON.stringify({ type: "activate-action-bar", slotIndex: 1 }),
    );
    client.socket.send(
      JSON.stringify({ type: "activate-action-bar", slotIndex: 1 }),
    );

    await waitFor(
      () =>
        client.messages.some(
          (message) => message.type === "error" && message.code === "item-exhausted",
        ),
      "the replay to be exhausted",
    );
    expect(
      client.messages.filter((message) => message.type === "item-text"),
    ).toHaveLength(1);
    expect(
      client.messages.filter(
        (message) => message.type === "action-bar-activation-result",
      ),
    ).toEqual([
      { type: "action-bar-activation-result", slotIndex: 1, accepted: true },
      { type: "action-bar-activation-result", slotIndex: 1, accepted: false },
    ]);
  });
});
