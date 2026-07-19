import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerMessage } from "@tibia/protocol";
import type { ServerConfig } from "../config";
import { GameServer } from "../GameServer";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { InMemoryAccountStore } from "../test/InMemoryAccountStore";
import { InMemoryCharacterStore } from "../test/InMemoryCharacterStore";
import { makeCharacter } from "../test/makeCharacter";
import type { TokenVerifier, VerifiedUser } from "../TokenVerifier";

const GRID = { width: 48, height: 32 };
const SPAWN = { x: 24, y: 16, z: 7 };
const BACKPACK_TYPE_ID = 2854;

const fakeVerifier: TokenVerifier = {
  async verify(token: string): Promise<VerifiedUser> {
    return { supabaseUserId: `sub-${token}`, email: null };
  },
};

const configWith = (commands: boolean): ServerConfig => ({
  port: 0,
  dev: { auth: false, commands },
  tickMs: 5,
  heartbeatMs: 30_000,
  authTimeoutMs: 5_000,
  trustProxyHeader: false,
  maxSessions: 10,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  combatSeed: 12345,
  rates: { experience: 1, skill: 1, magic: 1, loot: 1, spawn: 1 },
  starterTownId: 1,
  characterSaveIntervalMs: 30_000,
  maxCharacterSaveRetries: 3,
  characterSaveRetryDelayMs: 1,
  defaultViewRange: { x: 9, y: 7 },
  map: {
    source: "grid",
    name: "gm-test-grid",
    ...GRID,
    blocked: [],
    groundSpeed: 1,
  },
});

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

interface TestClient {
  socket: WebSocket;
  messages: ServerMessage[];
  playerId: string;
}

const connect = (
  port: number,
  token: string,
  characterId: string,
): Promise<TestClient> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    socket.on("open", () =>
      socket.send(JSON.stringify({ type: "auth", token, language: "en" })),
    );
    socket.on("error", reject);
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      messages.push(message);
      if (message.type === "auth-ok") {
        socket.send(JSON.stringify({ type: "select-character", characterId }));
        return;
      }
      if (message.type === "welcome") {
        resolve({ socket, messages, playerId: message.playerId });
      }
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

describe("GM commands", () => {
  let server: GameServer;
  const sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.terminate();
    await server.stop();
  });

  const startServer = (commands: boolean) => {
    const accounts = new InMemoryAccountStore();
    const characters = new InMemoryCharacterStore();
    const items = new MemoryItemStore(catalog);
    const characterId = randomUUID();
    characters.seed({
      ...makeCharacter(characterId, "Tester"),
      accountId: "acc-sub-tok-gm",
      positionX: SPAWN.x,
      positionY: SPAWN.y,
      positionZ: SPAWN.z,
    });
    const backpack: Item = {
      id: randomUUID(),
      typeId: BACKPACK_TYPE_ID,
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "equipment",
        characterId,
        slot: "backpack",
      },
    };
    items.seed(backpack);
    server = new GameServer(configWith(commands), {
      verifier: fakeVerifier,
      accounts,
      characters,
      items,
      itemCatalog: catalog,
    });
    server.start();
    return { characterId, characters, backpack };
  };

  const join = async (characterId: string): Promise<TestClient> => {
    const client = await connect(server.port, "tok-gm", characterId);
    sockets.push(client.socket);
    return client;
  };

  it("treats slash text as plain chat when GM commands are disabled", async () => {
    const { characterId } = startServer(false);
    const client = await join(characterId);

    say(client, "/i rope 2");

    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "creature-spoke" && message.text === "/i rope 2",
        ),
      "slash text to broadcast as ordinary speech",
    );
    expect(
      client.messages.some((message) => message.type === "gm-response"),
    ).toBe(false);
    expect(
      client.messages.some(
        (message) => message.type === "inventory-updated"),
    ).toBe(false);
  });

  it("creates an item into the backpack with /i", async () => {
    const rope = catalog.findByName("rope");
    if (!rope) throw new Error("rope missing from item catalog");
    const { characterId, backpack } = startServer(true);
    const client = await join(characterId);

    say(client, "/i rope");

    await waitFor(
      () =>
        client.messages.some(
          (message) => message.type === "gm-response" && message.ok,
        ),
      "gm-response for /i",
    );
    client.socket.send(
      JSON.stringify({
        type: "open-container",
        itemId: backpack.id,
        revision: backpack.version,
      }),
    );
    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "inventory-updated" &&
            (message.inventory.containers ?? []).some((open) =>
              open.items.some((slot) => slot.item.typeId === rope.id),
            ),
        ),
      "created rope to appear in the backpack",
    );
    expect(
      client.messages.some(
        (message) =>
          message.type === "creature-spoke" && message.text.startsWith("/"),
      ),
    ).toBe(false);
  });

  it("teleports with /goto and persists the new position", async () => {
    const { characterId, characters } = startServer(true);
    const client = await join(characterId);

    say(client, `/goto ${SPAWN.x + 10} ${SPAWN.y + 5}`);

    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "creature-moved" &&
            message.creatureId === client.playerId &&
            message.durationMs === 0 &&
            Math.abs(message.position.x - (SPAWN.x + 10)) <= 2 &&
            Math.abs(message.position.y - (SPAWN.y + 5)) <= 2,
        ),
      "teleport movement message",
    );
    await waitFor(() => {
      const persisted = characters.positionFor(characterId);
      return persisted !== null && persisted.x !== SPAWN.x;
    }, "teleported position to persist");
  });

  it("raises the character level with /level", async () => {
    const { characterId } = startServer(true);
    const client = await join(characterId);

    say(client, "/level 8");

    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "progression-updated" &&
            message.progression.level === 8,
        ),
      "progression update to level 8",
    );
  });

  it("reports spawn unavailability instead of failing silently", async () => {
    const { characterId } = startServer(true);
    const client = await join(characterId);

    say(client, "/spawn rat");

    await waitFor(
      () =>
        client.messages.some(
          (message) =>
            message.type === "gm-response" &&
            !message.ok &&
            message.text.includes("disabled"),
        ),
      "gm-response for /spawn without creature content",
    );
  });
});
