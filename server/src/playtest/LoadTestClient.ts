import WebSocket from "ws";
import {
  parseServerMessages,
  type ClientMessage,
  type Direction,
  type ServerMessage,
} from "@tibia/protocol";

export class LoadTestClient {
  private ownPlayerId = "";
  private direction: Direction | null = null;
  private closedReason: string | null = null;
  private readonly receivedTypes: string[] = [];
  private pendingProbe: {
    readonly sentAt: number;
    readonly direction: Direction;
    readonly resolve: (latencyMs: number) => void;
    readonly reject: (cause: Error) => void;
    readonly timeout: NodeJS.Timeout;
  } | null = null;

  private constructor(
    private readonly socket: WebSocket,
    private readonly token: string,
    private readonly characterId: string,
  ) {}

  static connect(
    url: string,
    index: number,
    timeoutMs = 30_000,
  ): Promise<LoadTestClient> {
    const suffix = String(index).padStart(4, "0");
    const socket = new WebSocket(url, {
      headers: {
        "Fly-Client-IP":
          `198.18.${Math.floor(index / 254)}.${(index % 254) + 1}`,
      },
    });
    const client = new LoadTestClient(
      socket,
      `load-${suffix}`,
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.terminate();
        reject(
          new Error(
            `player ${suffix} timed out entering the world after ` +
              `${client.receivedTypes.join(", ") || "no messages"}`,
          ),
        );
      }, timeoutMs);
      const fail = (cause: Error) => {
        clearTimeout(timeout);
        reject(cause);
      };
      socket.once("error", fail);
      socket.on("close", () => {
        client.closedReason ??= "closed by server";
        if (!client.ownPlayerId) fail(new Error(client.closedReason));
      });
      socket.on("message", (data) => {
        let json: unknown;
        try {
          json = JSON.parse(data.toString());
        } catch {
          fail(new Error("server sent invalid JSON"));
          return;
        }
        const messages = parseServerMessages(json);
        if (!messages) {
          fail(new Error("server sent an invalid protocol message"));
          return;
        }
        for (const message of messages) {
          client.handleMessage(message);
          if (message.type !== "welcome") continue;
          clearTimeout(timeout);
          socket.removeListener("error", fail);
          socket.on("error", (cause) => {
            client.closedReason = cause.message;
            client.rejectProbe(cause);
          });
          resolve(client);
        }
      });
      socket.once("open", () => {
        client.send({ type: "auth", token: client.token, language: "en" });
      });
    });
  }

  get isConnected(): boolean {
    return this.closedReason === null && this.socket.readyState === WebSocket.OPEN;
  }

  probe(direction: Direction, timeoutMs = 10_000): Promise<number> {
    if (!this.isConnected || !this.ownPlayerId || this.pendingProbe) {
      return Promise.reject(new Error("load client is not ready for a probe"));
    }
    const probeDirection = this.nextDirection(direction);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingProbe = null;
        reject(new Error(`turn probe timed out for ${this.characterId}`));
      }, timeoutMs);
      this.pendingProbe = {
        sentAt: performance.now(),
        direction: probeDirection,
        resolve,
        reject,
        timeout,
      };
      this.send({ type: "turn", direction: probeDirection });
    });
  }

  sendActivity(message: ClientMessage): void {
    if (!this.isConnected || !this.ownPlayerId) {
      throw new Error("load client is not ready for activity");
    }
    this.send(message);
  }

  terminate(): void {
    this.closedReason ??= "terminated by load test";
    this.rejectProbe(new Error(this.closedReason));
    this.socket.terminate();
  }

  private handleMessage(message: ServerMessage): void {
    this.receivedTypes.push(message.type);
    if (message.type === "error") {
      this.closedReason = `server error ${message.code ?? "unknown"}`;
      this.socket.terminate();
      return;
    }
    if (message.type === "auth-ok") {
      this.send({ type: "list-characters" });
      return;
    }
    if (message.type === "character-list") {
      const character = message.characters.find(
        (candidate) => candidate.id === this.characterId,
      );
      if (!character) {
        this.closedReason = `missing seeded character ${this.characterId}`;
        this.socket.terminate();
        return;
      }
      this.send({ type: "select-character", characterId: character.id });
      return;
    }
    if (message.type === "welcome") {
      this.ownPlayerId = message.playerId;
      this.direction = message.character.direction;
      return;
    }
    if (
      message.type === "creature-moved" &&
      message.creatureId === this.ownPlayerId &&
      message.direction
    ) {
      this.direction = message.direction;
    }
    const probe = this.pendingProbe;
    if (
      message.type !== "creature-moved" ||
      !probe ||
      message.creatureId !== this.ownPlayerId ||
      message.direction !== probe.direction
    ) {
      return;
    }
    this.pendingProbe = null;
    clearTimeout(probe.timeout);
    probe.resolve(performance.now() - probe.sentAt);
  }

  private nextDirection(preferred: Direction): Direction {
    if (preferred !== this.direction) return preferred;
    return preferred === "north" ? "south" : "north";
  }

  private rejectProbe(cause: Error): void {
    const probe = this.pendingProbe;
    if (!probe) return;
    this.pendingProbe = null;
    clearTimeout(probe.timeout);
    probe.reject(cause);
  }

  private send(message: object): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }
}
