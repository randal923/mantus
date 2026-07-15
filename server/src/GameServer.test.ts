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
  stepCooldownMs: 5,
  maxSessions: 10,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  starterTownId: 1,
  viewRange: VIEW_RANGE,
  map: { source: "grid", name: "test-grid", ...GRID, blocked: [] },
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

  async loadForLogin(
    accountId: string,
    characterId: string,
    loggedInAt: Date,
  ): Promise<Character | null> {
    const character = this.characters.get(characterId);
    if (!character || character.accountId !== accountId) return null;
    const loaded = {
      ...character,
      lastLoginAt: loggedInAt,
      updatedAt: loggedInAt,
      version: character.version + 1,
    };
    this.characters.set(characterId, loaded);
    return loaded;
  }

  async saveSnapshot(snapshot: CharacterSaveSnapshot): Promise<number> {
    const character = this.characters.get(snapshot.characterId);
    if (!character || character.version !== snapshot.expectedVersion) {
      throw new CharacterError("version-conflict");
    }
    const version = character.version + 1;
    this.characters.set(snapshot.characterId, {
      ...character,
      ...snapshot,
      id: character.id,
      positionX: snapshot.positionX,
      positionY: snapshot.positionY,
      positionZ: snapshot.positionZ,
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
      const self = message.players.find((p) => p.id === message.playerId);
      if (!self) {
        reject(new Error("welcome without own player state"));
        return;
      }
      resolve({
        socket,
        messages,
        playerId: message.playerId,
        spawn: { x: self.x, y: self.y },
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
    (m) => m.type === "player-left" && m.playerId === playerId,
  );

describe("view-range broadcast", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.terminate();
    server.stop();
  });

  const startServer = () => {
    server = new GameServer(testConfig, {
      verifier: fakeVerifier,
      accounts: new InMemoryAccountStore(),
      characters: new InMemoryCharacterStore(),
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
          (m) => m.type === "player-joined" && m.player.id === bob.playerId,
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
      (m) => m.type === "player-moved" && m.playerId === bob.playerId,
    );
    expect(updatesAboutBob.length).toBeGreaterThan(0);
    for (const update of updatesAboutBob) {
      if (update.type !== "player-moved") continue;
      expect(Math.abs(update.x - alice.spawn.x)).toBeLessThanOrEqual(
        VIEW_RANGE.x,
      );
      expect(Math.abs(update.y - alice.spawn.y)).toBeLessThanOrEqual(
        VIEW_RANGE.y,
      );
    }

    const leaveIndex = alice.messages.findIndex(
      (m) => m.type === "player-left" && m.playerId === bob.playerId,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    const leakedAfterLeave = alice.messages
      .slice(leaveIndex + 1)
      .filter(
        (m) =>
          (m.type === "player-moved" && m.playerId === bob.playerId) ||
          (m.type === "player-joined" && m.player.id === bob.playerId),
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
      (m) => m.type === "player-left" && m.playerId === bob.playerId,
    );
    bob.socket.send(JSON.stringify({ type: "move", direction: "west" }));

    await waitFor(
      () =>
        alice.messages
          .slice(leaveIndex + 1)
          .some(
            (m) => m.type === "player-joined" && m.player.id === bob.playerId,
          ),
      "Alice to see Bob re-enter view",
    );

    const reentry = alice.messages
      .slice(leaveIndex + 1)
      .find((m) => m.type === "player-joined" && m.player.id === bob.playerId);
    if (reentry?.type !== "player-joined") throw new Error("unreachable");
    expect(Math.abs(reentry.player.x - alice.spawn.x)).toBeLessThanOrEqual(
      VIEW_RANGE.x,
    );
    expect(Math.abs(reentry.player.y - alice.spawn.y)).toBeLessThanOrEqual(
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
            m.type === "player-moved" &&
            m.playerId === alice.playerId &&
            m.x === GRID.width - 1,
        ),
      "Alice to reach the east edge",
    );

    const bob = await join("Bob");
    const welcome = bob.messages.find((m) => m.type === "welcome");
    if (welcome?.type !== "welcome") throw new Error("unreachable");
    expect(welcome.players.map((p) => p.id)).toEqual([bob.playerId]);
  });
});

describe("auth gate", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.terminate();
    server.stop();
  });

  const startServer = (
    overrides: Partial<ServerConfig> = {},
    accounts = new InMemoryAccountStore(),
    characters = new InMemoryCharacterStore(),
  ) => {
    server = new GameServer(
      { ...testConfig, ...overrides },
      { verifier: fakeVerifier, accounts, characters },
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
    characters.seed({
      ...makeCharacter(randomUUID(), "Blocked Hero"),
      accountId: "acc-sub-tok.blocked",
      positionX: 3,
      positionY: 2,
      positionZ: 7,
    });
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
      x: GRID.width / 2,
      y: GRID.height / 2,
      z: 7,
    });
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
