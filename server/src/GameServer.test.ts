import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { Language, ServerMessage } from "@tibia/protocol";
import type { Account, AccountStore } from "./AccountStore";
import type {
  Character,
  CharacterSaveSnapshot,
  CharacterSummary,
} from "./character/Character";
import { CharacterError } from "./character/CharacterError";
import type { CharacterStore } from "./character/CharacterStore";
import type { ServerConfig } from "./config";
import { GameServer } from "./GameServer";
import { ItemCatalog } from "./item/ItemCatalog";
import { MemoryItemStore } from "./item/MemoryItemStore";
import { makeCharacter } from "./test/makeCharacter";
import type { TokenVerifier, VerifiedUser } from "./TokenVerifier";

const VIEW_RANGE = { x: 9, y: 7 };
const BAD_TOKEN = "bad.token";
const GRID = { width: 48, height: 32 };

const testConfig: ServerConfig = {
  port: 0,
  tickMs: 5,
  heartbeatMs: 30_000,
  authTimeoutMs: 5_000,
  trustProxyHeader: false,
  maxSessions: 10,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  combatSeed: 12345,
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

class InMemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, Account>();

  seed(account: Account): void {
    this.accounts.set(account.supabaseUserId, account);
  }

  languageFor(supabaseUserId: string): Language | undefined {
    return this.accounts.get(supabaseUserId)?.language;
  }

  async findOrCreateBySupabaseId(
    supabaseUserId: string,
    email: string | null,
    language: Language,
  ): Promise<Account> {
    const existing = this.accounts.get(supabaseUserId);
    if (existing) {
      const account = { ...existing, email, language };
      this.accounts.set(supabaseUserId, account);
      return account;
    }
    const account = {
      id: `acc-${supabaseUserId}`,
      supabaseUserId,
      email,
      bannedUntil: null,
      language,
    };
    this.accounts.set(supabaseUserId, account);
    return account;
  }

  async updateLanguage(accountId: string, language: Language): Promise<void> {
    const entry = [...this.accounts.entries()].find(
      ([, account]) => account.id === accountId,
    );
    if (!entry) throw new Error("account not found");
    const [supabaseUserId, account] = entry;
    this.accounts.set(supabaseUserId, { ...account, language });
  }
}

class InMemoryCharacterStore implements CharacterStore {
  private readonly characters = new Map<string, Character>();

  seed(character: Character): void {
    this.characters.set(character.id, character);
  }

  positionFor(characterId: string): { x: number; y: number; z: number } | null {
    const character = this.characters.get(characterId);
    if (!character) return null;
    return {
      x: character.positionX,
      y: character.positionY,
      z: character.positionZ,
    };
  }

  lastLoginFor(characterId: string): Date | null {
    return this.characters.get(characterId)?.lastLoginAt ?? null;
  }

  async listByAccountId(accountId: string): Promise<CharacterSummary[]> {
    return [...this.characters.values()]
      .filter((character) => character.accountId === accountId)
      .map((character) => ({
        id: character.id,
        displayName: character.displayName,
        vocation: character.vocation,
        level: character.level,
        outfit: character.outfit,
        lastLoginAt: character.lastLoginAt,
      }));
  }

  async create(character: Character, maxCharacters: number): Promise<Character> {
    const roster = [...this.characters.values()].filter(
      (existing) => existing.accountId === character.accountId,
    );
    if (roster.length >= maxCharacters) {
      throw new CharacterError("limit-reached");
    }
    if (
      [...this.characters.values()].some(
        (existing) => existing.normalizedName === character.normalizedName,
      )
    ) {
      throw new CharacterError("name-taken");
    }
    this.characters.set(character.id, character);
    return character;
  }

  async findByIdForAccount(
    accountId: string,
    characterId: string,
  ): Promise<Character | null> {
    const character = this.characters.get(characterId);
    if (!character || character.accountId !== accountId) return null;
    return character;
  }

  async recordLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<void> {
    const character = this.characters.get(characterId);
    if (!character || character.accountId !== accountId) {
      throw new CharacterError("not-found");
    }
    this.characters.set(characterId, { ...character, lastLoginAt: loggedInAt });
  }

  async saveSnapshot(snapshot: CharacterSaveSnapshot): Promise<number> {
    const character = this.characters.get(snapshot.characterId);
    if (!character || character.version !== snapshot.expectedVersion) {
      throw new CharacterError("version-conflict");
    }
    const version = character.version + 1;
    this.characters.set(snapshot.characterId, {
      ...character,
      level: snapshot.level,
      experience: snapshot.experience,
      magicLevel: snapshot.magicLevel,
      manaSpent: snapshot.manaSpent,
      health: snapshot.health,
      mana: snapshot.mana,
      soul: snapshot.soul,
      skills: snapshot.skills,
      progressionEventIds: [
        ...character.progressionEventIds,
        ...snapshot.progressionEvents.map((event) => event.id),
      ],
      positionX: snapshot.positionX,
      positionY: snapshot.positionY,
      positionZ: snapshot.positionZ,
      direction: snapshot.direction,
      outfit: snapshot.outfit,
      version,
      updatedAt: new Date(),
    });
    return version;
  }
}

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
      const message = JSON.parse(data.toString()) as ServerMessage;
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
              lookType: 128,
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
        return;
      }
      if (message.type !== "welcome") return;
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
    socket.on("message", (data) =>
      messages.push(JSON.parse(data.toString()) as ServerMessage),
    );
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
describe("auth gate", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  const startServer = (
    overrides: Partial<ServerConfig> = {},
    accounts = new InMemoryAccountStore(),
    characters = new InMemoryCharacterStore(),
  ) => {
    server = new GameServer(
      { ...testConfig, ...overrides },
      {
        verifier: fakeVerifier,
        accounts,
        characters,
        items: new MemoryItemStore(),
        itemCatalog: new ItemCatalog([]),
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

    first.socket.send(JSON.stringify({ type: "move", direction: "north" }));
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
      language: "en",
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
