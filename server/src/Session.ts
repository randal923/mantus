import type { RawData, WebSocket } from "ws";
import {
  clientMessageSchema,
  PROTOCOL_LIMITS,
  type ClientMessage,
  type Direction,
  type ServerMessage,
} from "@tibia/protocol";

/**
 * One WebSocket connection. Inbound messages are size/rate-checked and
 * schema-validated here, then *queued* — never executed. The game loop drains
 * the queue once per tick (charter rules 1, 5).
 */
export class Session {
  playerId: string | null = null;
  movementDirection: Direction | null = null;
  isAlive = true;

  private pendingIntents: ClientMessage[] = [];
  private windowStartedAt = 0;
  private messagesInWindow = 0;
  private violations = 0;

  constructor(
    readonly id: string,
    readonly remoteAddress: string,
    private readonly socket: WebSocket,
    private readonly limits: {
      maxPendingIntents: number;
      maxProtocolViolations: number;
    },
  ) {
    socket.on("message", (data) => this.onMessage(data));
    socket.on("pong", () => {
      this.isAlive = true;
    });
  }

  private onMessage(data: RawData): void {
    if (!this.withinRateLimit()) {
      this.sendError("rate-limited");
      this.socket.close();
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data.toString());
    } catch {
      this.strike();
      return;
    }
    const result = clientMessageSchema.safeParse(json);
    if (!result.success) {
      this.strike();
      return;
    }
    if (this.pendingIntents.length >= this.limits.maxPendingIntents) return;
    this.pendingIntents.push(result.data);
  }

  private withinRateLimit(): boolean {
    const now = Date.now();
    if (now - this.windowStartedAt >= 1000) {
      this.windowStartedAt = now;
      this.messagesInWindow = 0;
    }
    this.messagesInWindow += 1;
    return this.messagesInWindow <= PROTOCOL_LIMITS.maxMessagesPerSecond;
  }

  private strike(): void {
    this.violations += 1;
    if (this.violations >= this.limits.maxProtocolViolations) {
      this.sendError("invalid-message");
      this.socket.close();
    }
  }

  drainIntents(): ClientMessage[] {
    const intents = this.pendingIntents;
    this.pendingIntents = [];
    return intents;
  }

  send(message: ServerMessage): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  sendError(code: string): void {
    this.send({ type: "error", code });
  }

  ping(): void {
    this.isAlive = false;
    this.socket.ping();
  }

  terminate(): void {
    this.socket.terminate();
  }
}
