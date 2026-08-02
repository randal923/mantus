import type { RawData, WebSocket } from "ws";
import {
  clientMessageSchema,
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  DEFAULT_FIGHT_MODE,
  DEFAULT_HUNTING_BOT_ROUTE,
  DEFAULT_LOOT_FILTER,
  PROTOCOL_LIMITS,
  type ClientMessage,
  type ActivateActionBarMessage,
  type ActionBar,
  type ActionBarAction,
  type ActionBotSettings,
  type Direction,
  type FightMode,
  type HuntingBotRoute,
  type LootFilter,
  type Position,
  type ServerErrorCode,
  type ServerMessage,
  type ViewRange,
} from "@tibia/protocol";
import type { Account } from "./AccountStore";
import { monotonicNow } from "./monotonicNow";

/** Canary's generic action exhaust: 200 ms between item/object uses. */
export const USE_EXHAUST_MS = 200;

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
  uiSettingsUpdatePending = false;
  actionBarUpdatePending = false;
  actionBotUpdatePending = false;
  lootFilterUpdatePending = false;
  /** Ready-time for the next loot-filter item listing; throttles the window. */
  lootFilterItemsReadyAt = 0;
  huntingBotRouteUpdatePending = false;
  /**
   * The newest route update that arrived while a durable write was still in
   * flight. Applied when that write settles — the latest edit always wins,
   * it is never refused (intermediate ones coalesce away).
   */
  huntingBotDeferredRoute: HuntingBotRoute | null = null;
  /** One route trace may be in flight per connection; the search is not free. */
  huntingBotTracePending = false;
  huntingBotTraceReadyAt = 0;
  /**
   * The newest trace request that arrived during the cooldown or while one
   * was running. Started as soon as both clear, so a trace is never silently
   * dropped — the window would wait on a reply that never comes.
   */
  huntingBotDeferredTracePoints: Position[] | null = null;
  itemOperationPending = false;
  /**
   * Ready-time for the next generic item/object use. Canary applies a 200 ms
   * action exhaust per use; this is the server-authoritative timer, checked at
   * execution time inside the tick (charter rules 4, 8).
   */
  useExhaustReadyAt = 0;
  /**
   * Ready-time for the next shop buy/sell. Canary applies a 250 ms UI exhaust
   * per shop action; this is the server-authoritative timer, checked at
   * execution time inside the tick (charter rules 4, 8).
   */
  shopExhaustReadyAt = 0;
  /** One optimistic potion transaction may be durable at a time per user. */
  potionPersistPending = false;
  depotOperationPending = false;
  /**
   * Memory-first item mutations (depot and carried ops) apply instantly; this
   * counts their DB writes still in flight. While non-zero, DB-first item
   * flows must wait so per-character writes stay strictly ordered.
   */
  itemPersistsPending = 0;
  travelOperationPending = false;
  promotionOperationPending = false;
  storeOperationPending = false;
  readonly connectedAt = monotonicNow();
  playerId: string | null = null;
  movementDirection: Direction | null = null;
  bufferedMovementDirection: Direction | null = null;
  autoWalkDirections: Direction[] = [];
  attackTargetId: string | null = null;
  /**
   * Server-owned follow target. The client only names a creature; every step
   * is pathed and re-validated by the server inside the tick.
   */
  followTargetId: string | null = null;
  /**
   * Spell ids whose direction cast aims at the live attack target instead of
   * the player's facing. A preference only — it can never widen range, skip
   * a cooldown, or pick a target the player could not target anyway.
   */
  aimAtTargetSpellIds: ReadonlySet<string> = new Set();
  aimAtTargetUpdatePending = false;
  /** Next tick at which the combat-analyzer panel may be pushed again. */
  nextCombatAnalyzerAt = 0;
  fightMode: FightMode = { ...DEFAULT_FIGHT_MODE };
  readonly combatCooldowns = new Map<
    string,
    { readyAt: number; totalMs: number }
  >();
  readonly actionBotRuleReadyAt = new Map<string, number>();
  actionBotSuppressedAt = Number.NEGATIVE_INFINITY;
  pendingManualActionBarActivation: {
    readonly intent: ActivateActionBarMessage;
    readonly action: ActionBarAction;
    readonly attackTargetId: string | null;
    readonly direction: Direction;
  } | null = null;
  errorRevision = 0;
  actionBar: ActionBar = createDefaultActionBar();
  actionBotSettings: ActionBotSettings = {
    ...DEFAULT_ACTION_BOT_SETTINGS,
    rules: [],
  };
  /**
   * Auto-loot blacklist. Held per session so the tick can consult it without
   * a DB read; the durable copy is written behind the same trailing persist.
   */
  lootFilter: LootFilter = {
    ...DEFAULT_LOOT_FILTER,
    ignoredItemTypeIds: [],
  };
  /**
   * The character's saved hunting route. Held per session so the tick can
   * walk it without a DB read; the durable copy trails behind the same way
   * the loot filter's does.
   */
  huntingBotRoute: HuntingBotRoute = {
    ...DEFAULT_HUNTING_BOT_ROUTE,
    waypoints: [],
  };
  /**
   * Whether the bot is running. Deliberately session-only and never
   * persisted: a character must never log in already walking.
   */
  huntingBotEnabled = false;
  huntingBotWaypointIndex = 0;
  huntingBotRepathReadyAt = 0;
  /** Waypoints skipped in a row because nothing could path to them. */
  huntingBotSkips = 0;
  /** Failed path searches at the current waypoint; skips it once exhausted. */
  huntingBotPathFailures = 0;
  isAlive = true;
  readonly knownCreatureIds = new Set<string>();
  readonly knownMapItemTiles = new Map<string, Position>();
  viewRange: ViewRange;

  private pendingIntents: ClientMessage[] = [];
  private windowStartedAt = 0;
  private messagesInWindow = 0;
  private violations = 0;
  private batching = false;
  private batchedMessages: string[] = [];

  constructor(
    readonly id: string,
    readonly remoteAddress: string,
    private readonly socket: WebSocket,
    private readonly limits: {
      maxPendingIntents: number;
      maxProtocolViolations: number;
      initialViewRange: ViewRange;
    },
    private readonly onIntentQueued: (session: Session) => void = () => {},
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
    this.onIntentQueued(this);
  }

  private withinRateLimit(): boolean {
    const now = monotonicNow();
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

  get hasPendingIntents(): boolean {
    return this.pendingIntents.length > 0;
  }

  get needsMovementTick(): boolean {
    return Boolean(
      this.movementDirection ||
        this.bufferedMovementDirection ||
        this.autoWalkDirections.length > 0 ||
        // A running bot has to keep being ticked even between legs, or it
        // stops the moment it stands still on a waypoint.
        this.huntingBotEnabled,
    );
  }

  /** True while the generic use exhaust is still active (rule 8). */
  useExhausted(now: number): boolean {
    return now < this.useExhaustReadyAt;
  }

  /** Arms the next 200 ms use window; call only when a use actually fires. */
  armUseExhaust(now: number): void {
    this.useExhaustReadyAt = now + USE_EXHAUST_MS;
  }

  setViewRange(range: ViewRange): boolean {
    if (range.x === this.viewRange.x && range.y === this.viewRange.y) {
      return false;
    }
    this.viewRange = { ...range };
    return true;
  }

  send(message: ServerMessage): void {
    this.sendSerialized(JSON.stringify(message));
  }

  beginBatch(): void {
    this.batching = true;
  }

  flushBatch(): void {
    this.batching = false;
    if (this.batchedMessages.length === 0) return;
    const messages = this.batchedMessages;
    this.batchedMessages = [];
    if (this.socket.readyState !== this.socket.OPEN) return;

    let batch: string[] = [];
    let batchBytes = 2;
    for (const message of messages) {
      const separatorBytes = batch.length === 0 ? 0 : 1;
      const messageBytes = Buffer.byteLength(message);
      if (
        batch.length >= PROTOCOL_LIMITS.maxServerMessagesPerBatch ||
        (batch.length > 0 &&
          batchBytes + separatorBytes + messageBytes >
            PROTOCOL_LIMITS.maxMessageBytes)
      ) {
        if (!this.sendBatch(batch)) return;
        batch = [];
        batchBytes = 2;
      }
      batch.push(message);
      batchBytes += (batch.length === 1 ? 0 : 1) + messageBytes;
    }
    this.sendBatch(batch);
  }

  /**
   * Sends a server-authored payload that was serialized once for a whole
   * visibility broadcast. Callers must only pass protocol messages.
   */
  sendSerialized(message: string): void {
    if (this.batching) {
      this.batchedMessages.push(message);
      return;
    }
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(message);
  }

  sendError(code: ServerErrorCode): void {
    this.errorRevision += 1;
    this.send({ type: "error", code });
  }

  ping(): void {
    this.isAlive = false;
    this.socket.ping();
  }

  terminate(): void {
    this.flushBatch();
    this.socket.terminate();
  }

  private sendBatch(messages: ReadonlyArray<string>): boolean {
    if (messages.length === 0) return true;
    const payload =
      messages.length === 1 ? messages[0]! : `[${messages.join(",")}]`;
    if (
      this.socket.bufferedAmount + Buffer.byteLength(payload) >
      PROTOCOL_LIMITS.maxSocketBufferedBytes
    ) {
      this.socket.terminate();
      return false;
    }
    this.socket.send(payload);
    return true;
  }
}
