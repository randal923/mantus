import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerMessage } from "@tibia/protocol";
import type { Account, AccountStore } from "./AccountStore";
import type { ServerConfig } from "./config";
import { GameServer } from "./GameServer";
import type { TokenVerifier, VerifiedUser } from "./TokenVerifier";

const VIEW_RANGE = { x: 9, y: 7 };
const BAD_TOKEN = "bad.token";

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
  viewRange: VIEW_RANGE,
  map: { width: 48, height: 32, blocked: [] },
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

  async findOrCreateBySupabaseId(
    supabaseUserId: string,
    email: string | null,
  ): Promise<Account> {
    const existing = this.accounts.get(supabaseUserId);
    if (existing) return existing;
    const account = {
      id: `acc-${supabaseUserId}`,
      supabaseUserId,
      email,
      bannedUntil: null,
    };
    this.accounts.set(supabaseUserId, account);
    return account;
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
): Promise<TestClient> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    let closed = false;
    socket.on("close", () => {
      closed = true;
    });
    socket.on("open", () => socket.send(JSON.stringify({ type: "auth", token })));
    socket.on("error", reject);
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      messages.push(message);
      if (message.type === "auth-ok") {
        socket.send(JSON.stringify({ type: "join", name }));
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
            m.x === testConfig.map.width - 1,
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
  ) => {
    server = new GameServer(
      { ...testConfig, ...overrides },
      { verifier: fakeVerifier, accounts },
    );
    server.start();
  };

  it("rejects intents sent before authentication", async () => {
    startServer();
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(JSON.stringify({ type: "join", name: "Mallory" }));
    await waitFor(
      () => sawError(client.messages, "auth-required"),
      "auth-required error",
    );
  });

  it("disconnects a client presenting an invalid token", async () => {
    startServer();
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(JSON.stringify({ type: "auth", token: BAD_TOKEN }));
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

  it("rejects a banned account", async () => {
    const accounts = new InMemoryAccountStore();
    accounts.seed({
      id: "acc-banned",
      supabaseUserId: "sub-tok.outlaw",
      email: null,
      bannedUntil: new Date(Date.now() + 60_000),
    });
    startServer({}, accounts);
    const client = await openRaw(server.port);
    sockets.push(client.socket);
    client.socket.send(JSON.stringify({ type: "auth", token: "tok.outlaw" }));
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
});
