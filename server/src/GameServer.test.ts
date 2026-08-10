import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  parseServerMessages,
  type Language,
  type ServerMessage,
} from "@tibia/protocol";
import type { ServerConfig } from "./config";
import { NO_STAGES } from "./progression/stageRates";
import { DISABLED_RARITY_CONFIG } from "./rarity/RarityConfig";
import { GameServer, type GameServerDeps } from "./GameServer";
import { MemoryCooldownStore } from "./combat/MemoryCooldownStore";
import { ItemCatalog } from "./item/ItemCatalog";
import { MemoryItemStore } from "./item/MemoryItemStore";
import { InMemoryAccountStore } from "./test/InMemoryAccountStore";
import { InMemoryCharacterStore } from "./test/InMemoryCharacterStore";
import { makeCharacter } from "./test/makeCharacter";
import type { TokenVerifier, VerifiedUser } from "./TokenVerifier";
import { DEFAULT_CHAT_FLOOD_LIMITS } from "./chat/ChatFloodLimits";

const VIEW_RANGE = { x: 9, y: 7 };
const BAD_TOKEN = "bad.token";
const GRID = { width: 48, height: 32 };

const testConfig: ServerConfig = {
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
  defaultViewRange: VIEW_RANGE,
  map: {
    source: "grid",
    name: "test-grid",
    ...GRID,
    blocked: [],
    groundSpeed: 1,
  },
};

const fakeVerifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedUser> {
    if (token === BAD_TOKEN) throw new Error("invalid token");
    return { supabaseUserId: `sub-${token}`, email: null };
  },
};

interface TestClient {
  socket: WebSocket;
  messages: ServerMessage[];
  playerId: string;
  spawn: { x: number; y: number };
  closed: () => boolean;
}

const connect = (
  port: number,
  name: string,
  token = `tok.${name}`,
  language: Language = "en",
): Promise<TestClient> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    let closed = false;
    let createRequested = false;
    let selectRequested = false;
    socket.on("close", () => {
      closed = true;
    });
    socket.on("open", () =>
      socket.send(JSON.stringify({ type: "auth", token, language })),
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
          socket.send(JSON.stringify({ type: "list-characters" }));
          return;
        }
        if (message.type === "character-list") {
          const character = message.characters[0];
          if (!character && !createRequested) {
            createRequested = true;
            socket.send(
              JSON.stringify({
                type: "create-character",
                name,
                vocation: "Knight",
                sex: "male",
              }),
            );
            return;
          }
          if (character && !selectRequested) {
            selectRequested = true;
            socket.send(
              JSON.stringify({
                type: "select-character",
                characterId: character.id,
              }),
            );
          }
          continue;
        }
        if (message.type !== "welcome") continue;
        const self = message.creatures.find((p) => p.id === message.playerId);
        if (!self) {
          reject(new Error("welcome without own player state"));
          return;
        }
        resolve({
          socket,
          messages,
          playerId: message.playerId,
          spawn: { x: self.position.x, y: self.position.y },
          closed: () => closed,
        });
      }
    });
  });

interface RawClient {
  socket: WebSocket;
  messages: ServerMessage[];
  closed: () => boolean;
}

/** Opens a socket without authenticating; for probing the auth gate. */
const openRaw = (port: number): Promise<RawClient> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    let closed = false;
    socket.on("close", () => {
      closed = true;
    });
    socket.on("error", reject);
    socket.on("message", (data) => {
      const parsed = parseServerMessages(JSON.parse(data.toString()));
      if (parsed) messages.push(...parsed);
    });
    socket.on("open", () => resolve({ socket, messages, closed: () => closed }));
  });

const sawError = (messages: ServerMessage[], code: string) =>
  messages.some((m) => m.type === "error" && m.code === code);

const waitFor = async (
  predicate: () => boolean,
  label: string,
  timeoutMs = 5000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const sawLeave = (client: TestClient, playerId: string) =>
  client.messages.some(
    (m) => m.type === "creature-left" && m.creatureId === playerId,
  );

describe("view-range broadcast", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  const startServer = () => {
    server = new GameServer(testConfig, {
      verifier: fakeVerifier,
      accounts: new InMemoryAccountStore(),
      characters: new InMemoryCharacterStore(),
      items: new MemoryItemStore(),
      itemCatalog: new ItemCatalog([]),
    });
    server.start();
  };

  const join = async (name: string): Promise<TestClient> => {
    const client = await connect(server.port, name);
    sockets.push(client.socket);
    return client;
  };

  it("stops sending a player's movement once they leave view range", async () => {
    startServer();
    const alice = await join("Alice");
    const bob = await join("Bob");

    await waitFor(
      () =>
        alice.messages.some(
          (m) => m.type === "creature-joined" && m.creature.id === bob.playerId,
        ),
      "Alice to learn about Bob",
    );

    bob.socket.send(JSON.stringify({ type: "move", direction: "east" }));

    await waitFor(
      () => sawLeave(alice, bob.playerId),
      "Alice to see Bob leave view",
    );
    await waitFor(
      () => sawLeave(bob, alice.playerId),
      "Bob to see Alice leave view",
    );

    const updatesAboutBob = alice.messages.filter(
      (m) => m.type === "creature-moved" && m.creatureId === bob.playerId,
    );
    expect(updatesAboutBob.length).toBeGreaterThan(0);
    for (const update of updatesAboutBob) {
      if (update.type !== "creature-moved") continue;
      expect(Math.abs(update.position.x - alice.spawn.x)).toBeLessThanOrEqual(
        VIEW_RANGE.x,
      );
      expect(Math.abs(update.position.y - alice.spawn.y)).toBeLessThanOrEqual(
        VIEW_RANGE.y,
      );
    }

    const leaveIndex = alice.messages.findIndex(
      (m) => m.type === "creature-left" && m.creatureId === bob.playerId,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const leakedAfterLeave = alice.messages
      .slice(leaveIndex + 1)
      .filter(
        (m) =>
          (m.type === "creature-moved" && m.creatureId === bob.playerId) ||
          (m.type === "creature-joined" && m.creature.id === bob.playerId),
      );
    expect(leakedAfterLeave).toEqual([]);
  });

  it("re-announces a player who walks back into view", async () => {
    startServer();
    const alice = await join("Alice");
    const bob = await join("Bob");

    bob.socket.send(JSON.stringify({ type: "move", direction: "east" }));
    await waitFor(
      () => sawLeave(alice, bob.playerId),
      "Alice to see Bob leave view",
    );

    const leaveIndex = alice.messages.findIndex(
      (m) => m.type === "creature-left" && m.creatureId === bob.playerId,
    );
    bob.socket.send(JSON.stringify({ type: "move", direction: "west" }));

    await waitFor(
      () =>
        alice.messages
          .slice(leaveIndex + 1)
          .some(
            (m) => m.type === "creature-joined" && m.creature.id === bob.playerId,
          ),
      "Alice to see Bob re-enter view",
    );

    const reentry = alice.messages
      .slice(leaveIndex + 1)
      .find((m) => m.type === "creature-joined" && m.creature.id === bob.playerId);
    if (reentry?.type !== "creature-joined") throw new Error("unreachable");
    expect(
      Math.abs(reentry.creature.position.x - alice.spawn.x),
    ).toBeLessThanOrEqual(
      VIEW_RANGE.x,
    );
    expect(
      Math.abs(reentry.creature.position.y - alice.spawn.y),
    ).toBeLessThanOrEqual(
      VIEW_RANGE.y,
    );
  });

  it("only tells a joining player about players within view", async () => {
    startServer();
    const alice = await join("Alice");
    alice.socket.send(JSON.stringify({ type: "move", direction: "east" }));
    await waitFor(
      () =>
        alice.messages.some(
          (m) =>
            m.type === "creature-moved" &&
            m.creatureId === alice.playerId &&
            m.position.x === GRID.width - 1,
        ),
      "Alice to reach the east edge",
    );

    const bob = await join("Bob");
    const welcome = bob.messages.find((m) => m.type === "welcome");
    if (welcome?.type !== "welcome") throw new Error("unreachable");
    expect(welcome.creatures.map((p) => p.id)).toEqual([bob.playerId]);
  });

  it("reconciles visible players when the viewer resizes", async () => {
    startServer();
    const alice = await join("Alice");
    const bob = await join("Bob");

    alice.socket.send(
      JSON.stringify({ type: "set-viewport", range: { x: 1, y: 1 } }),
    );
    bob.socket.send(JSON.stringify({ type: "move", direction: "east" }));
    await waitFor(
      () => sawLeave(alice, bob.playerId),
      "Bob to leave Alice's small viewport",
    );
    bob.socket.send(JSON.stringify({ type: "stop-move" }));
    const leaveIndex = alice.messages.length;

    alice.socket.send(
      JSON.stringify({ type: "set-viewport", range: { x: 6, y: 6 } }),
    );
    await waitFor(
      () =>
        alice.messages
          .slice(leaveIndex)
          .some(
            (message) =>
              message.type === "creature-joined" &&
              message.creature.id === bob.playerId,
          ),
      "Bob to enter Alice's expanded viewport",
    );

    alice.socket.send(
      JSON.stringify({ type: "set-viewport", range: { x: 1, y: 1 } }),
    );
    await waitFor(
      () =>
        alice.messages
          .slice(leaveIndex)
          .filter(
            (message) =>
              message.type === "creature-left" &&
              message.creatureId === bob.playerId,
          ).length === 1,
      "Bob to leave Alice's shrunken viewport",
    );
  });
});
describe("chat routing", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  it("routes say to nearby players and private messages end to end", async () => {
    server = new GameServer(testConfig, {
      verifier: fakeVerifier,
      accounts: new InMemoryAccountStore(),
      characters: new InMemoryCharacterStore(),
      items: new MemoryItemStore(),
      itemCatalog: new ItemCatalog([]),
    });
    server.start();
    const alice = await connect(server.port, "Alice");
    const bob = await connect(server.port, "Bob");
    sockets.push(alice.socket, bob.socket);
    await waitFor(
      () =>
        bob.messages.some(
          (m) =>
            (m.type === "creature-joined" && m.creature.id === alice.playerId) ||
            (m.type === "welcome" &&
              m.creatures.some((c) => c.id === alice.playerId)),
        ),
      "Bob to know Alice",
    );

    alice.socket.send(
      JSON.stringify({ type: "speak", mode: "say", text: "hello bob" }),
    );
    await waitFor(
      () =>
        bob.messages.some(
          (m) =>
            m.type === "creature-spoke" &&
            m.name === "Alice" &&
            m.mode === "say" &&
            m.text === "hello bob",
        ),
      "Bob to hear Alice",
    );

    alice.socket.send(
      JSON.stringify({ type: "private-chat", to: "bob", text: "psst" }),
    );
    await waitFor(
      () =>
        bob.messages.some(
          (m) =>
            m.type === "private-chat-delivered" &&
            m.direction === "incoming" &&
            m.counterpart === "Alice" &&
            m.text === "psst",
        ),
      "Bob to receive the private message",
    );
    await waitFor(
      () =>
        alice.messages.some(
          (m) =>
            m.type === "private-chat-delivered" &&
            m.direction === "outgoing" &&
            m.counterpart === "Bob",
        ),
      "Alice to receive the outgoing echo",
    );
  });
});

describe("auth gate", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  const startServer = (
    overrides: Partial<ServerConfig> = {},
    accounts = new InMemoryAccountStore(),
    characters = new InMemoryCharacterStore(),
    verifier: TokenVerifier = fakeVerifier,
    extraDeps: Partial<GameServerDeps> = {},
  ) => {
    server = new GameServer(
      { ...testConfig, ...overrides },
      {
        verifier,
        accounts,
        characters,
        items: new MemoryItemStore(),
        itemCatalog: new ItemCatalog([]),
        ...extraDeps,
      },
    );
    server.start();
  };

  it("rejects intents sent before authentication", async () => {
    startServer();
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(JSON.stringify({ type: "list-characters" }));
    await waitFor(
      () => sawError(client.messages, "auth-required"),
      "auth-required error",
    );
  });

  it("disconnects a client presenting an invalid token", async () => {
    startServer();
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(
      JSON.stringify({ type: "auth", token: BAD_TOKEN, language: "en" }),
    );
    await waitFor(
      () => sawError(client.messages, "auth-failed") && client.closed(),
      "auth-failed error and disconnect",
    );
  });

  it("disconnects an authentication request whose verifier never settles", async () => {
    startServer(
      { authTimeoutMs: 25 },
      new InMemoryAccountStore(),
      new InMemoryCharacterStore(),
      { verify: () => new Promise<VerifiedUser>(() => {}) },
    );
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(
      JSON.stringify({ type: "auth", token: "tok.hanging", language: "en" }),
    );

    await waitFor(
      () => sawError(client.messages, "auth-timeout") && client.closed(),
      "pending authentication timeout",
    );
  });

  it("kicks the old session when the same account logs in again", async () => {
    startServer();
    const first = await connect(server.port, "Alice", "tok.same-account");
    sockets.push(first.socket);
    const second = await connect(server.port, "Alice", "tok.same-account");
    sockets.push(second.socket);
    await waitFor(
      () => sawError(first.messages, "logged-in-elsewhere") && first.closed(),
      "first session to be kicked",
    );
    expect(second.closed()).toBe(false);
  });

  it("restores account fight controls with safe defaults", async () => {
    const accounts = new InMemoryAccountStore();
    startServer({}, accounts);
    const first = await connect(server.port, "Fighter", "tok.fighter");
    sockets.push(first.socket);
    const firstWelcome = first.messages.find(
      (message) => message.type === "welcome",
    );
    if (firstWelcome?.type !== "welcome") {
      throw new Error("missing first fighter welcome");
    }
    expect(firstWelcome.fightState.mode).toEqual({
      attack: "offensive",
      chase: false,
      secure: true,
    });

    const persistedMode = {
      attack: "defensive",
      chase: true,
      secure: false,
    } as const;
    first.socket.send(
      JSON.stringify({ type: "set-fight-mode", mode: persistedMode }),
    );
    await waitFor(
      () =>
        accounts.fightModeFor("sub-tok.fighter")?.attack ===
        persistedMode.attack,
      "fight mode persistence",
    );

    const second = await connect(server.port, "Fighter", "tok.fighter");
    sockets.push(second.socket);
    const secondWelcome = second.messages.find(
      (message) => message.type === "welcome",
    );
    if (secondWelcome?.type !== "welcome") {
      throw new Error("missing second fighter welcome");
    }
    expect(secondWelcome.fightState.mode).toEqual(persistedMode);
  });

  it("projects premium status and remaining days in character selection", async () => {
    const accounts = new InMemoryAccountStore();
    accounts.seed({
      id: "acc-sub-tok.premium",
      supabaseUserId: "sub-tok.premium",
      email: null,
      bannedUntil: null,
      role: "player" as const,
      isStaff: false,
      premiumUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000),
      mantusCoins: 0,
      language: "en",
      uiSettings: {},
      fightMode: { attack: "offensive", chase: false, secure: true },
    });
    startServer({}, accounts);
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(
      JSON.stringify({ type: "auth", token: "tok.premium", language: "en" }),
    );
    await waitFor(
      () => client.messages.some((message) => message.type === "auth-ok"),
      "premium authentication",
    );
    client.socket.send(JSON.stringify({ type: "list-characters" }));
    await waitFor(
      () => client.messages.some((message) => message.type === "character-list"),
      "premium character list",
    );

    expect(
      client.messages.find((message) => message.type === "auth-ok"),
    ).toMatchObject({
      accountTier: "premium",
      premiumDaysRemaining: 3,
    });
    expect(
      client.messages.find((message) => message.type === "character-list"),
    ).toMatchObject({
      accountTier: "premium",
      premiumDaysRemaining: 3,
    });
  });

  it("does not list or select another account's character", async () => {
    const characters = new InMemoryCharacterStore();
    const owned = {
      ...makeCharacter(randomUUID(), "Owner Hero"),
      accountId: "acc-sub-tok.owner",
    };
    characters.seed(owned);
    startServer({}, new InMemoryAccountStore(), characters);
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(
      JSON.stringify({ type: "auth", token: "tok.intruder", language: "en" }),
    );
    await waitFor(
      () => client.messages.some((message) => message.type === "auth-ok"),
      "intruder authentication",
    );
    client.socket.send(JSON.stringify({ type: "list-characters" }));
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "character-list" &&
            message.characters.length === 0,
        ),
      "isolated empty character list",
    );

    client.socket.send(
      JSON.stringify({
        type: "select-character",
        characterId: owned.id,
      }),
    );
    await waitFor(
      () => sawError(client.messages, "character-not-found"),
      "cross-account selection rejection",
    );
    expect(
      client.messages.some((message) => message.type === "welcome"),
    ).toBe(false);
  });

  it("falls back to the temple when a saved position is blocked", async () => {
    const characters = new InMemoryCharacterStore();
    const character = {
      ...makeCharacter(randomUUID(), "Blocked Hero"),
      accountId: "acc-sub-tok.blocked",
      positionX: 3,
      positionY: 2,
      positionZ: 7,
    };
    characters.seed(character);
    startServer(
      {
        map: {
          source: "grid",
          name: "blocked-grid",
          ...GRID,
          blocked: [[3, 2]],
        },
      },
      new InMemoryAccountStore(),
      characters,
    );

    const client = await connect(
      server.port,
      "Blocked Hero",
      "tok.blocked",
    );
    sockets.push(client.socket);

    expect(client.spawn).toEqual({ x: GRID.width / 2, y: GRID.height / 2 });
    const welcome = client.messages.find(
      (message) => message.type === "welcome",
    );
    if (welcome?.type !== "welcome") throw new Error("missing welcome");
    expect(welcome.character).toMatchObject({
      name: "Blocked Hero",
      position: { x: GRID.width / 2, y: GRID.height / 2, z: 7 },
    });
    await waitFor(
      () =>
        characters.positionFor(character.id)?.x === GRID.width / 2 &&
        characters.positionFor(character.id)?.y === GRID.height / 2,
      "repaired temple position to persist",
    );
  });

  it("sends an authoritative correction when a move is blocked", async () => {
    startServer({
      map: {
        source: "grid",
        name: "correction-grid",
        ...GRID,
        blocked: [[GRID.width / 2, GRID.height / 2 - 1]],
        groundSpeed: 50,
      },
    });
    const client = await connect(server.port, "Corrected", "tok.corrected");
    sockets.push(client.socket);

    client.socket.send(JSON.stringify({ type: "move", direction: "north" }));
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "position-correction" &&
            message.reason === "blocked",
        ),
      "blocked movement correction",
    );

    const correction = client.messages.find(
      (message) => message.type === "position-correction",
    );
    if (correction?.type !== "position-correction") {
      throw new Error("missing position correction");
    }
    expect(correction.position).toEqual({ ...client.spawn, z: 7 });
    expect(correction.positionRevision).toBe(0);
  });

  it("turns a player without moving them", async () => {
    startServer({
      map: {
        source: "grid",
        name: "turn-grid",
        ...GRID,
        blocked: [],
        groundSpeed: 50,
      },
    });
    const client = await connect(server.port, "Turner", "tok.turner");
    sockets.push(client.socket);
    const messageOffset = client.messages.length;

    client.socket.send(
      JSON.stringify({ type: "turn", direction: "north" }),
    );
    await waitFor(
      () =>
        client.messages.slice(messageOffset).some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === client.playerId &&
            message.direction === "north",
      ),
      "turn pose",
    );
    await new Promise((resolve) => setTimeout(resolve, 25));

    const poses = client.messages.slice(messageOffset).filter(
      (message) =>
        message.type === "creature-moved" &&
        message.creatureId === client.playerId,
    );
    expect(poses).toHaveLength(1);
    expect(poses[0]).toMatchObject({
      type: "creature-moved",
      from: { ...client.spawn, z: 7 },
      position: { ...client.spawn, z: 7 },
      direction: "north",
      positionRevision: 0,
      durationMs: 0,
    });
  });

  it("continues held movement when the wall clock moves backward", async () => {
    startServer({
      map: {
        source: "grid",
        name: "clock-rollback-grid",
        ...GRID,
        blocked: [],
        groundSpeed: 200,
      },
    });
    const client = await connect(server.port, "Clock Walker", "tok.clock");
    sockets.push(client.socket);

    client.socket.send(
      JSON.stringify({ type: "move", direction: "north", queueStep: true }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === client.playerId &&
            message.positionRevision === 1,
        ),
      "initial movement before clock rollback",
    );
    const firstMove = client.messages.find(
      (message) =>
        message.type === "creature-moved" &&
        message.creatureId === client.playerId &&
        message.positionRevision === 1,
    );
    if (firstMove?.type !== "creature-moved") {
      throw new Error("missing initial movement");
    }

    const realDateNow = Date.now.bind(Date);
    vi.spyOn(Date, "now").mockImplementation(() => realDateNow() - 2_000);
    const rollbackAt = performance.now();
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === client.playerId &&
            message.positionRevision === 2,
        ),
      "movement after clock rollback",
      firstMove.durationMs + 500,
    );

    expect(performance.now() - rollbackAt).toBeLessThan(
      firstMove.durationMs + 300,
    );
  });

  it("rejects an auto-walk path whose starting revision is stale", async () => {
    startServer({
      map: {
        source: "grid",
        name: "stale-auto-walk-grid",
        ...GRID,
        blocked: [],
        groundSpeed: 1,
      },
    });
    const client = await connect(server.port, "Stale Walker", "tok.stale-walk");
    sockets.push(client.socket);

    client.socket.send(
      JSON.stringify({
        type: "auto-walk",
        positionRevision: 1,
        directions: ["east"],
      }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "position-correction" &&
            message.reason === "stale-revision",
        ),
      "stale auto-walk correction",
    );

    expect(
      client.messages.some(
        (message) =>
          message.type === "creature-moved" &&
          message.creatureId === client.playerId,
      ),
    ).toBe(false);
  });

  it("revalidates every auto-walk step and stops at the first blocker", async () => {
    startServer({
      map: {
        source: "grid",
        name: "bounded-auto-walk-grid",
        ...GRID,
        blocked: [[GRID.width / 2 + 2, GRID.height / 2 - 1]],
        groundSpeed: 1,
      },
    });
    const client = await connect(server.port, "Path Walker", "tok.path-walk");
    sockets.push(client.socket);

    client.socket.send(
      JSON.stringify({
        type: "auto-walk",
        positionRevision: 0,
        directions: ["east", "east", "north", "east"],
      }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "position-correction" &&
            message.reason === "blocked" &&
            message.positionRevision === 2,
        ),
      "blocked auto-walk correction",
    );

    const moves = client.messages.filter(
      (message) =>
        message.type === "creature-moved" &&
        message.creatureId === client.playerId &&
        message.durationMs > 0,
    );
    expect(moves).toHaveLength(2);
    expect(moves.at(-1)).toMatchObject({
      type: "creature-moved",
      position: {
        x: client.spawn.x + 2,
        y: client.spawn.y,
        z: 7,
      },
    });
  });

  it("buffers a tapped direction before resuming an older held key", async () => {
    startServer({
      map: {
        source: "grid",
        name: "buffered-direction-grid",
        ...GRID,
        blocked: [],
        groundSpeed: 200,
      },
    });
    const client = await connect(server.port, "Buffered", "tok.buffered");
    sockets.push(client.socket);

    client.socket.send(
      JSON.stringify({
        type: "move",
        direction: "north",
        queueStep: true,
      }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === client.playerId &&
            message.positionRevision === 1,
        ),
      "initial north step",
    );

    client.socket.send(
      JSON.stringify({ type: "move", direction: "east", queueStep: true }),
    );
    client.socket.send(
      JSON.stringify({ type: "move", direction: "north", queueStep: false }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === client.playerId &&
            message.positionRevision === 2 &&
            message.direction === "east" &&
            message.position.x === client.spawn.x + 1 &&
            message.position.y === client.spawn.y - 1,
        ),
      "buffered east step",
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === client.playerId &&
            message.positionRevision === 3 &&
            message.direction === "north" &&
            message.position.x === client.spawn.x + 1 &&
            message.position.y === client.spawn.y - 2,
        ),
      "resumed north step",
    );
    client.socket.send(JSON.stringify({ type: "stop-move" }));
  });

  it("sends only visible server-owned map items", async () => {
    const spawn = { x: GRID.width / 2, y: GRID.height / 2, z: 7 };
    startServer({
      map: {
        source: "grid",
        name: "item-visibility-grid",
        ...GRID,
        blocked: [],
        floors: [6, 7],
        groundSpeed: 50,
        items: [
          {
            position: spawn,
            item: {
              instanceId: "visible",
              itemId: 3003,
              stackIndex: 1,
              mutable: true,
            },
          },
          {
            position: { ...spawn, z: 6 },
            item: {
              instanceId: "covered-floor",
              itemId: 3003,
              stackIndex: 1,
              mutable: true,
            },
          },
          {
            position: { x: 0, y: 0, z: 7 },
            item: {
              instanceId: "out-of-view",
              itemId: 3003,
              stackIndex: 1,
              mutable: true,
            },
          },
        ],
      },
    });
    const client = await connect(server.port, "Viewer", "tok.viewer");
    sockets.push(client.socket);
    await waitFor(
      () => client.messages.some((message) => message.type === "tile-states"),
      "visible tile state",
    );

    const instanceIds = client.messages.flatMap((message) =>
      message.type === "tile-states"
        ? message.visible.flatMap((tile) =>
            tile.items.map((item) => item.instanceId),
          )
        : [],
    );
    expect(instanceIds).toEqual(["visible"]);
  });

  it("reconciles server-owned map items when the viewport changes", async () => {
    const spawn = { x: GRID.width / 2, y: GRID.height / 2, z: 7 };
    const itemPosition = { ...spawn, x: spawn.x + 4 };
    startServer({
      defaultViewRange: { x: 1, y: 1 },
      map: {
        source: "grid",
        name: "resized-item-grid",
        ...GRID,
        blocked: [],
        items: [
          {
            position: itemPosition,
            item: {
              instanceId: "resized-visible",
              itemId: 3003,
              stackIndex: 1,
              mutable: true,
            },
          },
        ],
      },
    });
    const client = await connect(server.port, "Resize Viewer", "tok.resize-viewer");
    sockets.push(client.socket);

    client.socket.send(
      JSON.stringify({ type: "set-viewport", range: { x: 4, y: 2 } }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "tile-states" &&
            message.visible.some((tile) =>
              tile.items.some((item) => item.instanceId === "resized-visible"),
            ),
        ),
      "expanded viewport item",
    );

    client.socket.send(
      JSON.stringify({ type: "set-viewport", range: { x: 1, y: 1 } }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "tile-states" &&
            message.hidden.some(
              (position) =>
                position.x === itemPosition.x &&
                position.y === itemPosition.y &&
                position.z === itemPosition.z,
            ),
        ),
      "shrunken viewport item removal",
    );
  });

  it("incrementally reveals and hides map items while walking", async () => {
    const spawn = { x: GRID.width / 2, y: GRID.height / 2, z: 7 };
    const itemPosition = { ...spawn, x: spawn.x + 2 };
    startServer({
      defaultViewRange: { x: 1, y: 1 },
      map: {
        source: "grid",
        name: "walking-item-grid",
        ...GRID,
        blocked: [],
        groundSpeed: 1,
        items: [
          {
            position: itemPosition,
            item: {
              instanceId: "walking-visible",
              itemId: 3003,
              stackIndex: 1,
              mutable: true,
            },
          },
        ],
      },
    });
    const client = await connect(server.port, "Walking Viewer", "tok.walk-items");
    sockets.push(client.socket);

    client.socket.send(
      JSON.stringify({ type: "move", direction: "east", queueStep: true }),
    );
    client.socket.send(JSON.stringify({ type: "stop-move" }));
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "tile-states" &&
            message.visible.some((tile) =>
              tile.items.some((item) => item.instanceId === "walking-visible"),
            ),
        ),
      "walked-into-view item",
    );

    client.socket.send(
      JSON.stringify({ type: "move", direction: "west", queueStep: true }),
    );
    client.socket.send(JSON.stringify({ type: "stop-move" }));
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "tile-states" &&
            message.hidden.some(
              (position) =>
                position.x === itemPosition.x &&
                position.y === itemPosition.y &&
                position.z === itemPosition.z,
            ),
        ),
      "walked-out-of-view item",
    );
  });

  it("restores the last persisted position after reconnecting", async () => {
    const characters = new InMemoryCharacterStore();
    startServer(
      {
        map: {
          source: "grid",
          name: "slow-grid",
          ...GRID,
          blocked: [],
          groundSpeed: 300,
        },
      },
      new InMemoryAccountStore(),
      characters,
    );
    const first = await connect(server.port, "Walker", "tok.reconnect");
    sockets.push(first.socket);

    first.socket.send(JSON.stringify({ type: "move", direction: "east" }));
    await waitFor(
      () =>
        first.messages.some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === first.playerId &&
            message.position.x === first.spawn.x + 1,
        ),
      "eastward step",
    );
    first.socket.terminate();
    await waitFor(
      () => characters.positionFor(first.playerId)?.x === first.spawn.x + 1,
      "logout save",
    );

    const second = await connect(server.port, "Walker", "tok.reconnect");
    sockets.push(second.socket);
    expect(second.playerId).toBe(first.playerId);
    expect(second.spawn).toEqual({ x: first.spawn.x + 1, y: first.spawn.y });
    const welcome = second.messages.find((message) => message.type === "welcome");
    if (welcome?.type !== "welcome") throw new Error("missing reconnect welcome");
    expect(welcome.character).toMatchObject({
      id: first.playerId,
      direction: "east",
      health: 150,
      maxHealth: 150,
      mana: 55,
      maxMana: 55,
      capacity: 400,
      outfit: {
        lookType: 128,
        head: 78,
        body: 68,
        legs: 58,
        feet: 76,
        addons: 0,
      },
    });
  });

  it("carries live spell cooldowns across a relog", async () => {
    class CountingCooldownStore extends MemoryCooldownStore {
      replaces = 0;
      override async replace(
        characterId: string,
        cooldowns: Parameters<MemoryCooldownStore["replace"]>[1],
      ): Promise<void> {
        await super.replace(characterId, cooldowns);
        this.replaces += 1;
      }
    }
    const cooldowns = new CountingCooldownStore();
    startServer(
      {},
      new InMemoryAccountStore(),
      new InMemoryCharacterStore(),
      fakeVerifier,
      { cooldowns },
    );
    const first = await connect(server.port, "Chiller", "tok.chiller");
    sockets.push(first.socket);
    first.socket.terminate();
    // The disconnect flush writes the (empty) live map before the seed.
    await waitFor(() => cooldowns.replaces >= 1, "first logout flush");

    const readyAt = Date.now() + 3_600_000;
    await cooldowns.replace(first.playerId, [
      { key: "spell:uteta-res-eq", readyAt, totalMs: 7_200_000 },
    ]);

    const second = await connect(server.port, "Chiller", "tok.chiller");
    sockets.push(second.socket);
    const welcome = second.messages.find(
      (message) => message.type === "welcome",
    );
    if (welcome?.type !== "welcome") throw new Error("missing relog welcome");
    const restored = welcome.fightState.cooldowns.find(
      (cooldown) => cooldown.group === "spell:uteta-res-eq",
    );
    expect(restored).toBeDefined();
    expect(restored?.totalMs).toBe(7_200_000);
    expect(restored?.remainingMs).toBeGreaterThan(3_500_000);

    // A second relog proves the logout write round-trips the same rows.
    const flushesBefore = cooldowns.replaces;
    second.socket.terminate();
    await waitFor(
      () => cooldowns.replaces > flushesBefore,
      "second logout flush",
    );
    expect(await cooldowns.load(first.playerId)).toEqual([
      { key: "spell:uteta-res-eq", readyAt, totalMs: 7_200_000 },
    ]);
  });

  it("caps a restored cooldown at its own total", async () => {
    // A row written under a clock that later diverged (host sleep stalls the
    // monotonic clock) can claim a readyAt far beyond the spell's total; the
    // login restore must not turn that into an hours-long cooldown.
    class CountingCooldownStore extends MemoryCooldownStore {
      replaces = 0;
      override async replace(
        characterId: string,
        cooldowns: Parameters<MemoryCooldownStore["replace"]>[1],
      ): Promise<void> {
        await super.replace(characterId, cooldowns);
        this.replaces += 1;
      }
    }
    const cooldowns = new CountingCooldownStore();
    startServer(
      {},
      new InMemoryAccountStore(),
      new InMemoryCharacterStore(),
      fakeVerifier,
      { cooldowns },
    );
    const first = await connect(server.port, "Chiller", "tok.chiller");
    sockets.push(first.socket);
    first.socket.terminate();
    await waitFor(() => cooldowns.replaces >= 1, "logout flush");
    await cooldowns.replace(first.playerId, [
      {
        key: "spell:exevo-gran-mas-vis",
        readyAt: Date.now() + 3_600_000,
        totalMs: 36_000,
      },
    ]);

    const second = await connect(server.port, "Chiller", "tok.chiller");
    sockets.push(second.socket);
    const welcome = second.messages.find(
      (message) => message.type === "welcome",
    );
    if (welcome?.type !== "welcome") throw new Error("missing relog welcome");
    const restored = welcome.fightState.cooldowns.find(
      (cooldown) => cooldown.group === "spell:exevo-gran-mas-vis",
    );
    expect(restored).toBeDefined();
    expect(restored?.remainingMs).toBeGreaterThan(30_000);
    expect(restored?.remainingMs).toBeLessThanOrEqual(36_000);
  });

  it("restores the authoritative floor after a transition and reconnect", async () => {
    const characters = new InMemoryCharacterStore();
    const source = { x: GRID.width / 2, y: GRID.height / 2 - 1, z: 7 };
    const destination = { x: source.x, y: source.y - 1, z: 6 };
    startServer(
      {
        map: {
          source: "grid",
          name: "transition-grid",
          ...GRID,
          blocked: [],
          groundSpeed: 300,
          floors: [6, 7],
          transitions: [
            {
              kind: "floor-change",
              activation: "step",
              source,
              destination,
              itemId: 1947,
            },
          ],
        },
      },
      new InMemoryAccountStore(),
      characters,
    );
    const first = await connect(server.port, "Climber", "tok.climber");
    sockets.push(first.socket);

    first.socket.send(
      JSON.stringify({
        type: "auto-walk",
        positionRevision: 0,
        directions: ["north"],
      }),
    );
    await waitFor(
      () =>
        first.messages.some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === first.playerId &&
            message.position.z === destination.z,
        ),
      "floor transition",
    );
    expect(
      first.messages.find(
        (message) =>
          message.type === "creature-moved" &&
          message.creatureId === first.playerId &&
          message.position.z === destination.z,
      ),
    ).toMatchObject({ durationMs: 0 });
    first.socket.terminate();
    await waitFor(
      () => {
        const persisted = characters.positionFor(first.playerId);
        return (
          persisted?.x === destination.x &&
          persisted.y === destination.y &&
          persisted.z === destination.z
        );
      },
      "transition position save",
    );

    const second = await connect(server.port, "Climber", "tok.climber");
    sockets.push(second.socket);
    const welcome = second.messages.find((message) => message.type === "welcome");
    if (welcome?.type !== "welcome") throw new Error("missing transition welcome");
    expect(welcome.character.position).toEqual(destination);
  });

  it("reconciles old-floor and destination-floor visibility after stairs", async () => {
    const characters = new InMemoryCharacterStore();
    const source = { x: GRID.width / 2, y: GRID.height / 2 - 1, z: 7 };
    const destination = { x: source.x, y: source.y - 1, z: 6 };
    characters.seed({
      ...makeCharacter(randomUUID(), "Upper"),
      accountId: "acc-sub-tok.upper",
      positionX: destination.x + 2,
      positionY: destination.y,
      positionZ: 6,
    });
    startServer(
      {
        map: {
          source: "grid",
          name: "floor-visibility-grid",
          ...GRID,
          blocked: [],
          floors: [6, 7],
          groundSpeed: 300,
          transitions: [
            {
              kind: "floor-change",
              activation: "step",
              source,
              destination,
              itemId: 1947,
            },
          ],
        },
      },
      new InMemoryAccountStore(),
      characters,
    );
    const upper = await connect(server.port, "Upper", "tok.upper");
    const climber = await connect(server.port, "Climber", "tok.floor-climber");
    const watcher = await connect(server.port, "Watcher", "tok.watcher");
    sockets.push(upper.socket, climber.socket, watcher.socket);
    await waitFor(
      () =>
        watcher.messages.some(
          (message) =>
            (message.type === "creature-joined" &&
              message.creature.id === climber.playerId) ||
            (message.type === "welcome" &&
              message.creatures.some((player) => player.id === climber.playerId)),
        ),
      "watcher to see climber before stairs",
    );

    climber.socket.send(JSON.stringify({ type: "move", direction: "north" }));

    await waitFor(
      () => sawLeave(watcher, climber.playerId),
      "old-floor watcher to lose climber",
    );
    await waitFor(
      () =>
        upper.messages.some(
          (message) =>
            message.type === "creature-joined" &&
            message.creature.id === climber.playerId,
        ),
      "destination-floor player to see climber",
    );
    await waitFor(
      () =>
        climber.messages.some(
          (message) =>
            message.type === "creature-joined" &&
            message.creature.id === upper.playerId,
        ),
      "climber to see destination-floor player",
    );
  });

  it("records last login only after a character enters the world", async () => {
    const characters = new InMemoryCharacterStore();
    const character = {
      ...makeCharacter(randomUUID(), "No Room"),
      accountId: "acc-sub-tok.no-room",
      positionX: 0,
      positionY: 0,
      positionZ: 7,
    };
    characters.seed(character);
    startServer(
      {
        map: {
          source: "grid",
          name: "full-grid",
          width: 1,
          height: 1,
          blocked: [[0, 0]],
        },
      },
      new InMemoryAccountStore(),
      characters,
    );
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(
      JSON.stringify({ type: "auth", token: "tok.no-room", language: "en" }),
    );
    await waitFor(
      () => client.messages.some((message) => message.type === "auth-ok"),
      "authentication",
    );
    client.socket.send(JSON.stringify({ type: "list-characters" }));
    await waitFor(
      () => client.messages.some((message) => message.type === "character-list"),
      "character list",
    );
    client.socket.send(
      JSON.stringify({ type: "select-character", characterId: character.id }),
    );
    await waitFor(
      () => sawError(client.messages, "world-full") && client.closed(),
      "world-full rejection",
    );

    expect(characters.lastLoginFor(character.id)).toBeNull();
  });

  it("rejects a banned account", async () => {
    const accounts = new InMemoryAccountStore();
    accounts.seed({
      id: "acc-banned",
      supabaseUserId: "sub-tok.outlaw",
      email: null,
      bannedUntil: new Date(Date.now() + 60_000),
      role: "player" as const,
      isStaff: false,
      premiumUntil: null,
      mantusCoins: 0,
      language: "en",
      uiSettings: {},
      fightMode: { attack: "offensive", chase: false, secure: true },
    });
    startServer({}, accounts);
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(
      JSON.stringify({ type: "auth", token: "tok.outlaw", language: "en" }),
    );
    await waitFor(
      () => sawError(client.messages, "account-banned") && client.closed(),
      "banned account to be rejected",
    );
  });

  it("drops connections that never authenticate", async () => {
    startServer({ authTimeoutMs: 100 });
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    await waitFor(
      () => sawError(client.messages, "auth-timeout") && client.closed(),
      "unauthenticated socket to be dropped",
    );
  });

  it("persists a schema-validated language change for the session account", async () => {
    const accounts = new InMemoryAccountStore();
    startServer({}, accounts);
    const client = await connect(server.port, "Alice", "tok.language", "en");
    sockets.push(client.socket);

    client.socket.send(
      JSON.stringify({ type: "set-language", language: "pt-BR" }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "language-updated" &&
            message.language === "pt-BR",
        ),
      "language update acknowledgement",
    );

    expect(accounts.languageFor("sub-tok.language")).toBe("pt-BR");
  });

  it("keeps the stored account language when a later login sends a different one", async () => {
    const accounts = new InMemoryAccountStore();
    startServer({}, accounts);
    const first = await connect(server.port, "Alice", "tok.language", "pt-BR");
    sockets.push(first.socket);
    first.socket.close();

    const second = await connect(server.port, "Alice", "tok.language", "en");
    sockets.push(second.socket);

    expect(accounts.languageFor("sub-tok.language")).toBe("pt-BR");
    expect(
      second.messages.some(
        (message) => message.type === "auth-ok" && message.language === "pt-BR",
      ),
    ).toBe(true);
  });

  it("rejects an unsupported language before it reaches the account store", async () => {
    const accounts = new InMemoryAccountStore();
    startServer({}, accounts);
    const client = await connect(server.port, "Alice", "tok.language", "en");
    sockets.push(client.socket);

    for (let attempt = 0; attempt < testConfig.maxProtocolViolations; attempt++) {
      client.socket.send(
        JSON.stringify({ type: "set-language", language: "es" }),
      );
    }
    await waitFor(
      () => sawError(client.messages, "invalid-message") && client.closed(),
      "invalid language messages to be rejected",
    );

    expect(accounts.languageFor("sub-tok.language")).toBe("en");
  });
});

describe("wakeable tick", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  it("answers intents without waiting out the tick interval", async () => {
    server = new GameServer(
      { ...testConfig, tickMs: 200 },
      {
        verifier: fakeVerifier,
        accounts: new InMemoryAccountStore(),
        characters: new InMemoryCharacterStore(),
        items: new MemoryItemStore(),
        itemCatalog: new ItemCatalog([]),
      },
    );
    server.start();
    const client = await connect(server.port, "Waker");
    sockets.push(client.socket);

    for (let nonce = 1; nonce <= 5; nonce += 1) {
      const sentAt = performance.now();
      client.socket.send(JSON.stringify({ type: "ping", nonce }));
      await waitFor(
        () =>
          client.messages.some(
            (message) => message.type === "pong" && message.nonce === nonce,
          ),
        `pong ${nonce}`,
      );
      // Without the wake each pong waits for the 200 ms interval tick; the
      // bound stays far above a woken tick but far below the interval.
      expect(performance.now() - sentAt).toBeLessThan(60);
    }
  }, 15_000);
});

describe("login queue", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  const startServer = (
    overrides: Partial<ServerConfig>,
    accounts = new InMemoryAccountStore(),
  ) => {
    server = new GameServer(
      { ...testConfig, ...overrides },
      {
        verifier: fakeVerifier,
        accounts,
        characters: new InMemoryCharacterStore(),
        items: new MemoryItemStore(),
        itemCatalog: new ItemCatalog([]),
      },
    );
    server.start();
  };

  const seedAccount = (
    accounts: InMemoryAccountStore,
    token: string,
    extra: { premiumUntil?: Date; role?: "gamemaster" } = {},
  ) =>
    accounts.seed({
      id: `acc-sub-${token}`,
      supabaseUserId: `sub-${token}`,
      email: null,
      bannedUntil: null,
      role: extra.role ?? ("player" as const),
      isStaff: extra.role !== undefined,
      premiumUntil: extra.premiumUntil ?? null,
      mantusCoins: 0,
      language: "en" as const,
      uiSettings: {},
      fightMode: { attack: "offensive", chase: false, secure: true },
    });

  const authed = async (token: string): Promise<RawClient> => {
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(JSON.stringify({ type: "auth", token, language: "en" }));
    return client;
  };

  const lastPosition = (client: RawClient): number | undefined => {
    const updates = client.messages.filter((m) => m.type === "queue-position");
    const last = updates[updates.length - 1];
    return last?.type === "queue-position" ? last.position : undefined;
  };

  const sawAuthOk = (client: RawClient) =>
    client.messages.some((m) => m.type === "auth-ok");

  const takeSeat = async (name: string): Promise<TestClient> => {
    const seat = await connect(server.port, name);
    sockets.push(seat.socket);
    return seat;
  };

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it("queues logins at capacity and admits premium ahead of free", async () => {
    const accounts = new InMemoryAccountStore();
    seedAccount(accounts, "tok.vip", {
      premiumUntil: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    });
    startServer({ maxSessions: 1, maxLoginQueueSize: 5 }, accounts);
    const seat = await takeSeat("Seatholder");

    const free = await authed("tok.free");
    await waitFor(() => lastPosition(free) === 1, "free queued at 1");
    expect(sawAuthOk(free)).toBe(false);

    const vip = await authed("tok.vip");
    await waitFor(() => lastPosition(vip) === 1, "premium queued at 1");
    await waitFor(() => lastPosition(free) === 2, "free pushed to 2");

    seat.socket.close();
    await waitFor(() => sawAuthOk(vip), "premium admitted first");
    await waitFor(() => lastPosition(free) === 1, "free back to 1");
    expect(sawAuthOk(free)).toBe(false);

    vip.socket.close();
    await waitFor(() => sawAuthOk(free), "free admitted after premium leaves");
  });

  it("refuses everything but the keepalive while queued", async () => {
    startServer({ maxSessions: 1, maxLoginQueueSize: 5 });
    const seat = await takeSeat("Blocker");

    const queued = await authed("tok.sneak");
    await waitFor(() => lastPosition(queued) === 1, "session queued");

    queued.socket.send(JSON.stringify({ type: "list-characters" }));
    queued.socket.send(JSON.stringify({ type: "ping", nonce: 7 }));
    await waitFor(
      () => queued.messages.some((m) => m.type === "pong" && m.nonce === 7),
      "keepalive served",
    );
    await sleep(100);
    expect(queued.messages.some((m) => m.type === "character-list")).toBe(
      false,
    );
    expect(sawAuthOk(queued)).toBe(false);
    expect(queued.closed()).toBe(false);

    seat.socket.close();
    await waitFor(() => sawAuthOk(queued), "admitted after seat freed");
    queued.socket.send(JSON.stringify({ type: "list-characters" }));
    await waitFor(
      () => queued.messages.some((m) => m.type === "character-list"),
      "characters served once admitted",
    );
  });

  it("closes with server-full when the queue itself is full", async () => {
    startServer({ maxSessions: 1, maxLoginQueueSize: 1 });
    await takeSeat("Seatholder");

    const queued = await authed("tok.waits");
    await waitFor(() => lastPosition(queued) === 1, "first login queued");

    const rejected = await authed("tok.late");
    await waitFor(
      () => sawError(rejected.messages, "server-full") && rejected.closed(),
      "server-full rejection",
    );
    expect(queued.closed()).toBe(false);
  });

  it("lets a reconnecting account keep its place in line", async () => {
    startServer({ maxSessions: 1, maxLoginQueueSize: 5 });
    await takeSeat("Seatholder");

    const first = await authed("tok.head");
    await waitFor(() => lastPosition(first) === 1, "head queued");
    const second = await authed("tok.tail");
    await waitFor(() => lastPosition(second) === 2, "tail queued");

    const reconnect = await authed("tok.head");
    await waitFor(() => first.closed(), "old socket kicked");
    await waitFor(() => lastPosition(reconnect) === 1, "place kept");
    await sleep(100);
    expect(lastPosition(second)).toBe(2);
  });

  it("seats exactly one of two logins racing for the last seat", async () => {
    startServer({ maxSessions: 2, maxLoginQueueSize: 5 });
    await takeSeat("Seatholder");

    const [a, b] = await Promise.all([
      authed("tok.racerA"),
      authed("tok.racerB"),
    ]);
    await waitFor(
      () =>
        [a, b].filter(sawAuthOk).length === 1 &&
        [a, b].filter((c) => lastPosition(c) === 1).length === 1,
      "one seated, one queued",
    );
  });

  it("lets a gamemaster bypass a full world", async () => {
    const accounts = new InMemoryAccountStore();
    seedAccount(accounts, "tok.gm", { role: "gamemaster" });
    startServer({ maxSessions: 1, maxLoginQueueSize: 5 }, accounts);
    await takeSeat("Seatholder");

    const queued = await authed("tok.mortal");
    await waitFor(() => lastPosition(queued) === 1, "player queued");

    const gm = await authed("tok.gm");
    await waitFor(() => sawAuthOk(gm), "gamemaster admitted");
    await sleep(100);
    expect(lastPosition(queued)).toBe(1);
  });
});
