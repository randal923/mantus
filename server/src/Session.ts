import type { RawData, WebSocket } from "ws";
import {
  clientMessageSchema,
  PROTOCOL_LIMITS,
  type ClientMessage,
  type Direction,
  type Position,
  type ServerErrorCode,
  type ServerMessage,
  type ViewRange,
} from "@tibia/protocol";
import type { Account } from "./AccountStore";

/**
 * One WebSocket connection. Inbound messages are size/rate-checked and
 * schema-validated here, then *queued* — never executed. The game loop drains
 * the queue once per tick (charter rules 1, 5).
 */
export class Session {
  /** Set inside the tick once the token is verified; null = unauthenticated. */
  account: Account | null = null;
  /** True while a token is being verified; blocks repeat auth attempts. */
  authPending = false;
  characterOperationPending = false;
  languageUpdatePending = false;
  itemOperationPending = false;
  readonly connectedAt = Date.now();
  playerId: string | null = null;
  movementDirection: Direction | null = null;
  bufferedMovementDirection: Direction | null = null;
  isAlive = true;
  readonly knownCreatureIds = new Set<string>();
  readonly knownMapItemTiles = new Map<string, Position>();
  viewRange: ViewRange;

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
      initialViewRange: ViewRange;
    },
  ) {
    this.viewRange = { ...limits.initialViewRange };
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

  setViewRange(range: ViewRange): boolean {
    if (range.x === this.viewRange.x && range.y === this.viewRange.y) {
      return false;
    }
    this.viewRange = { ...range };
    return true;
  }

  send(message: ServerMessage): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  sendError(code: ServerErrorCode): void {
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
