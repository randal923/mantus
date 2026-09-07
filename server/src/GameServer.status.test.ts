import { connect as connectTcp } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { parseServerMessages, type ServerMessage } from "@tibia/protocol";
import type { ServerConfig } from "./config";
import { GameServer } from "./GameServer";
import { ItemCatalog } from "./item/ItemCatalog";
import { MemoryItemStore } from "./item/MemoryItemStore";
import { NO_STAGES } from "./progression/stageRates";
import { DISABLED_RARITY_CONFIG } from "./rarity/RarityConfig";
import { DEFAULT_CHAT_FLOOD_LIMITS } from "./chat/ChatFloodLimits";
import { InMemoryAccountStore } from "./test/InMemoryAccountStore";
import { InMemoryCharacterStore } from "./test/InMemoryCharacterStore";
import type { TokenVerifier, VerifiedUser } from "./TokenVerifier";

const XML_QUERY = Buffer.from([0x06, 0x00, 0xff, 0xff, 0x69, 0x6e, 0x66, 0x6f]);

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
    experience: 3,
    skill: 2,
    magic: 2,
    loot: 4,
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
    name: "status-grid",
    width: 48,
    height: 32,
    blocked: [],
    groundSpeed: 1,
  },
  status: {
    port: 0,
    ip: "203.0.113.7",
    serverName: "Mantus Online",
    location: "United States",
    url: "https://mantusonline.com/",
    ownerName: "Mantus Online",
    ownerEmail: "",
    motd: "Welcome",
    cacheMs: 0,
  },
};

const fakeVerifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedUser> {
    return { supabaseUserId: `sub-${token}`, email: null };
  },
};

/** Authenticates, creates a character, and enters the world. */
const enterWorld = (port: number, name: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    let createRequested = false;
    let selectRequested = false;
    socket.on("open", () =>
      socket.send(
        JSON.stringify({ type: "auth", token: `tok.${name}`, language: "en" }),
      ),
    );
    socket.on("error", reject);
    socket.on("message", (data) => {
      const parsed = parseServerMessages(JSON.parse(data.toString()));
      if (!parsed) {
        reject(new Error("server sent invalid protocol messages"));
        return;
      }
      for (const message of parsed) onMessage(message);
    });
    const onMessage = (message: ServerMessage) => {
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
        return;
      }
      if (message.type === "welcome") resolve(socket);
    };
  });

const queryStatus = (port: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = connectTcp({ port, host: "127.0.0.1" });
    const chunks: Buffer[] = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.on("connect", () => socket.write(XML_QUERY));
  });

const attribute = (xml: string, element: string, name: string): string => {
  const match = new RegExp(`<${element} [^>]*\\b${name}="([^"]*)"`).exec(xml);
  const value = match?.[1];
  if (value === undefined) {
    throw new Error(`missing ${element}@${name} in ${xml}`);
  }
  return value;
};

const waitFor = async (
  predicate: () => Promise<boolean>,
  label: string,
): Promise<void> => {
  const deadline = Date.now() + 5_000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe("GameServer status protocol", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  it("reports live player counts and the process peak without any per-player data", async () => {
    server = new GameServer(testConfig, {
      verifier: fakeVerifier,
      accounts: new InMemoryAccountStore(),
      characters: new InMemoryCharacterStore(),
      items: new MemoryItemStore(),
      itemCatalog: new ItemCatalog([]),
    });
    server.start();
    await waitFor(async () => server.statusPort !== undefined, "status port");
    const port = server.statusPort;
    if (port === undefined) throw new Error("status listener did not start");

    const empty = await queryStatus(port);
    expect(attribute(empty, "players", "online")).toBe("0");
    expect(attribute(empty, "players", "unique")).toBe("0");
    expect(attribute(empty, "players", "max")).toBe("10");
    expect(attribute(empty, "serverinfo", "ip")).toBe("203.0.113.7");
    expect(attribute(empty, "rates", "experience")).toBe("3");
    expect(attribute(empty, "map", "name")).toBe("status-grid");

    sockets.push(await enterWorld(server.port, "Alice"));
    sockets.push(await enterWorld(server.port, "Bob"));
    await waitFor(
      async () => attribute(await queryStatus(port), "players", "online") === "2",
      "two players online",
    );
    const busy = await queryStatus(port);
    // Both test clients share 127.0.0.1, so unique stays at one address.
    expect(attribute(busy, "players", "unique")).toBe("1");
    expect(attribute(busy, "players", "peak")).toBe("2");
    expect(busy).not.toContain("Alice");
    expect(busy).not.toContain("Bob");

    const bob = sockets.pop();
    bob?.terminate();
    await waitFor(
      async () => attribute(await queryStatus(port), "players", "online") === "1",
      "one player online",
    );
    expect(attribute(await queryStatus(port), "players", "peak")).toBe("2");
  });
});
