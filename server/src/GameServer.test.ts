import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ServerMessage } from "@tibia/protocol";
import type { ServerConfig } from "./config";
import { GameServer } from "./GameServer";

const VIEW_RANGE = { x: 9, y: 7 };

const testConfig: ServerConfig = {
  port: 0,
  tickMs: 5,
  heartbeatMs: 30_000,
  stepCooldownMs: 5,
  maxSessions: 10,
  maxPendingIntents: 16,
  maxProtocolViolations: 5,
  viewRange: VIEW_RANGE,
  map: { width: 48, height: 32, blocked: [] },
};

interface TestClient {
  socket: WebSocket;
  messages: ServerMessage[];
  playerId: string;
  spawn: { x: number; y: number };
}

const connect = (port: number, name: string): Promise<TestClient> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const messages: ServerMessage[] = [];
    socket.on("open", () => socket.send(JSON.stringify({ type: "join", name })));
    socket.on("error", reject);
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      messages.push(message);
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
      });
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
    server = new GameServer(testConfig);
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
    if (bob.messages[0]?.type !== "welcome") throw new Error("unreachable");
    expect(
      bob.messages[0].players.map((p) => p.id),
    ).toEqual([bob.playerId]);
  });
});
