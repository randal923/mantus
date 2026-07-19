import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerMessage } from "@tibia/protocol";
import type { ServerConfig } from "../config";
import { GameServer } from "../GameServer";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { InMemoryAccountStore } from "../test/InMemoryAccountStore";
import { InMemoryCharacterStore } from "../test/InMemoryCharacterStore";
import { makeCharacter } from "../test/makeCharacter";
import type { TokenVerifier, VerifiedUser } from "../TokenVerifier";
import { MemoryModerationStore } from "./MemoryModerationStore";

const GRID = { width: 48, height: 32 };
const SPAWN = { x: 24, y: 16, z: 7 };

const fakeVerifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedUser> {
    return { supabaseUserId: `sub-${token}`, email: null };
  },
};

const config: ServerConfig = {
  port: 0,
  dev: { auth: false, commands: true },
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
  defaultViewRange: { x: 9, y: 7 },
  map: {
    source: "grid",
    name: "moderation-test-grid",
    ...GRID,
    blocked: [],
    groundSpeed: 1,
  },
};

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

interface TestClient {
  socket: WebSocket;
  messages: ServerMessage[];
  playerId: string;
  closed: boolean;
}

const connect = (
  port: number,
  token: string,
  characterId: string,
): Promise<TestClient> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    const client: TestClient = { socket, messages, playerId: "", closed: false };
    socket.on("open", () =>
      socket.send(JSON.stringify({ type: "auth", token, language: "en" })),
    );
    socket.on("error", reject);
    socket.on("close", () => {
      client.closed = true;
    });
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      messages.push(message);
      if (message.type === "auth-ok") {
        socket.send(JSON.stringify({ type: "select-character", characterId }));
        return;
      }
      if (message.type === "welcome") {
        client.playerId = message.playerId;
        resolve(client);
      }
    });
  });

/** Connects and resolves once the socket closes (e.g. banned at login). */
const connectUntilClosed = (
  port: number,
  token: string,
): Promise<ServerMessage[]> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    socket.on("open", () =>
      socket.send(JSON.stringify({ type: "auth", token, language: "en" })),
    );
    socket.on("error", reject);
    socket.on("close", () => resolve(messages));
    socket.on("message", (data) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });
  });

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

const say = (client: TestClient, text: string) =>
  client.socket.send(JSON.stringify({ type: "speak", mode: "say", text }));

describe("GM moderation commands (e2e)", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  const startServer = () => {
    const accounts = new InMemoryAccountStore();
    const characters = new InMemoryCharacterStore();
    const items = new MemoryItemStore(catalog);
    const moderation = new MemoryModerationStore((accountId, expiresAt) =>
      accounts.setBannedUntil(accountId, expiresAt),
    );
    const gmCharacterId = randomUUID();
    const victimCharacterId = randomUUID();
    characters.seed({
      ...makeCharacter(gmCharacterId, "Gamemaster"),
      accountId: "acc-sub-tok-gm",
      positionX: SPAWN.x,
      positionY: SPAWN.y,
      positionZ: SPAWN.z,
    });
    characters.seed({
      ...makeCharacter(victimCharacterId, "Victim"),
      accountId: "acc-sub-tok-victim",
      positionX: SPAWN.x + 1,
      positionY: SPAWN.y,
      positionZ: SPAWN.z,
    });
    moderation.registerCharacter(gmCharacterId, "Gamemaster", "acc-sub-tok-gm");
    moderation.registerCharacter(
      victimCharacterId,
      "Victim",
      "acc-sub-tok-victim",
    );
    server = new GameServer(config, {
      verifier: fakeVerifier,
      accounts,
      characters,
      items,
      itemCatalog: catalog,
      moderation,
    });
    server.start();
    return { gmCharacterId, victimCharacterId, moderation };
  };

  const join = async (token: string, characterId: string): Promise<TestClient> => {
    const client = await connect(server.port, token, characterId);
    sockets.push(client.socket);
    return client;
  };

  it("mutes and unmutes with an audit row per applied action", async () => {
    const { gmCharacterId, victimCharacterId, moderation } = startServer();
    const gm = await join("tok-gm", gmCharacterId);
    const victim = await join("tok-victim", victimCharacterId);

    say(gm, "/mute Victim 5 spamming");
    await waitFor(
      () =>
        gm.messages.some(
          (message) => message.type === "gm-response" && message.ok,
        ),
      "gm-response for /mute",
    );
    expect(moderation.actions).toEqual([
      {
        action: "mute",
        targetCharacterId: victimCharacterId,
        issuedByCharacterId: gmCharacterId,
        reason: "spamming",
      },
    ]);

    say(victim, "hello?");
    await waitFor(
      () =>
        victim.messages.some(
          (message) =>
            message.type === "chat-rejected" && message.reason === "muted",
        ),
      "muted victim's speech to be rejected",
    );
    expect(
      victim.messages.some(
        (message) =>
          message.type === "creature-spoke" && message.text === "hello?",
      ),
    ).toBe(false);

    say(gm, "/unmute Victim");
    await waitFor(
      () =>
        gm.messages.some(
          (message) =>
            message.type === "gm-response" &&
            message.ok &&
            message.text.includes("Unmuted"),
        ),
      "gm-response for /unmute",
    );
    say(victim, "free again");
    await waitFor(
      () =>
        victim.messages.some(
          (message) =>
            message.type === "creature-spoke" && message.text === "free again",
        ),
      "unmuted victim's speech to broadcast",
    );
    expect(moderation.actions.map((action) => action.action)).toEqual([
      "mute",
      "unmute",
    ]);
  });

  it("kicks an online player and records the action", async () => {
    const { gmCharacterId, victimCharacterId, moderation } = startServer();
    const gm = await join("tok-gm", gmCharacterId);
    const victim = await join("tok-victim", victimCharacterId);

    say(gm, "/kick Victim");
    await waitFor(() => victim.closed, "victim session to be disconnected");
    expect(moderation.actions).toEqual([
      {
        action: "kick",
        targetCharacterId: victimCharacterId,
        issuedByCharacterId: gmCharacterId,
        reason: "",
      },
    ]);
  });

  it("bans an account, kicks its session, blocks login, and unbans", async () => {
    const { gmCharacterId, victimCharacterId, moderation } = startServer();
    const gm = await join("tok-gm", gmCharacterId);
    const victim = await join("tok-victim", victimCharacterId);

    say(gm, "/ban Victim 1 rmt");
    await waitFor(() => victim.closed, "banned victim to be disconnected");

    // A banned account cannot authenticate again.
    const rejected = await connectUntilClosed(server.port, "tok-victim");
    expect(
      rejected.some((message) => message.type === "auth-ok"),
    ).toBe(false);

    say(gm, "/unban Victim");
    await waitFor(
      () =>
        gm.messages.some(
          (message) =>
            message.type === "gm-response" &&
            message.ok &&
            message.text.includes("Unbanned"),
        ),
      "gm-response for /unban",
    );
    const back = await join("tok-victim", victimCharacterId);
    expect(back.playerId).toBe(victimCharacterId);
    expect(moderation.actions.map((action) => action.action)).toEqual([
      "ban",
      "unban",
    ]);
  });

  it("records notes and rejects moderation of unknown targets", async () => {
    const { gmCharacterId, moderation } = startServer();
    const gm = await join("tok-gm", gmCharacterId);

    say(gm, "/note Victim watch this one");
    await waitFor(
      () =>
        gm.messages.some(
          (message) => message.type === "gm-response" && message.ok,
        ),
      "gm-response for /note",
    );
    expect(moderation.actions.at(-1)?.action).toBe("note");
    expect(moderation.actions.at(-1)?.reason).toBe("watch this one");

    say(gm, "/mute Nobody 5 test");
    await waitFor(
      () =>
        gm.messages.some(
          (message) =>
            message.type === "gm-response" &&
            !message.ok &&
            message.text.includes("No character"),
        ),
      "target-not-found gm-response",
    );
    expect(
      moderation.actions.filter((action) => action.action === "mute"),
    ).toHaveLength(0);
  });

  it("accepts a player report and rate limits the next one", async () => {
    const { victimCharacterId } = startServer();
    const reporter = await join("tok-victim", victimCharacterId);

    reporter.socket.send(
      JSON.stringify({
        type: "report-player",
        targetName: "Gamemaster",
        reason: "abuse",
        comment: "verbal abuse",
      }),
    );
    await waitFor(
      () =>
        reporter.messages.some((message) => message.type === "report-received"),
      "report acknowledgement",
    );

    reporter.socket.send(
      JSON.stringify({
        type: "report-player",
        targetName: "Gamemaster",
        reason: "abuse",
        comment: "again",
      }),
    );
    await waitFor(
      () =>
        reporter.messages.some(
          (message) =>
            message.type === "report-action-failed" &&
            message.reason === "rate-limited",
        ),
      "second report within a minute to be rate limited",
    );
  });
});
