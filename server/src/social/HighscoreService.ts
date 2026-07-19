import {
  HIGHSCORE_LIMITS,
  type HighscoresActionFailedReason,
  type HighscoresGetMessage,
  type HighscoresStateMessage,
} from "@tibia/protocol";
import type { Session } from "../Session";
import type { World } from "../World";
import type { HighscoreStore } from "./HighscoreStore";

interface CachedPage {
  readonly expiresAt: number;
  readonly message: HighscoresStateMessage;
}

/**
 * Serves the bounded highscore read model with a 10-minute in-memory
 * cache per (category, vocation, page) tuple. Requests re-validate the
 * page bound at execution time and only ever expose the public ranking
 * fields the store projects (charter rule 6).
 */
export class HighscoreService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly pendingBySession = new Set<string>();
  private readonly cache = new Map<string, CachedPage>();

  constructor(
    private readonly world: World,
    private readonly store?: HighscoreStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
    this.pendingBySession.delete(session.id);
  }

  handle(session: Session, intent: HighscoresGetMessage, now: number): void {
    const characterId = session.playerId;
    if (!characterId || !this.world.getPlayer(characterId)) {
      session.sendError("join-required");
      return;
    }
    const store = this.store;
    if (!store) {
      this.fail(session, "unavailable");
      return;
    }
    // Re-checked at execution time even though the schema already bounds it.
    if (intent.page < 0 || intent.page > HIGHSCORE_LIMITS.maxPage) {
      this.fail(session, "invalid-request");
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt || this.pendingBySession.has(session.id)) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(
      session.id,
      now + HIGHSCORE_LIMITS.actionCooldownMs,
    );
    const vocation = intent.vocation ?? null;
    const key = `${intent.category}|${vocation ?? "all"}|${intent.page}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      session.send(cached.message);
      return;
    }
    this.pendingBySession.add(session.id);
    const operation = store
      .loadPage({ category: intent.category, vocation, page: intent.page })
      .then(
        (record) => {
          this.outcomes.push((at) => {
            this.pendingBySession.delete(session.id);
            const totalPages = Math.min(
              HIGHSCORE_LIMITS.maxPage + 1,
              Math.max(
                1,
                Math.ceil(record.totalEntries / HIGHSCORE_LIMITS.pageSize),
              ),
            );
            const message: HighscoresStateMessage = {
              type: "highscores-state",
              category: intent.category,
              ...(intent.vocation !== undefined
                ? { vocation: intent.vocation }
                : {}),
              page: intent.page,
              totalPages,
              entries: record.rows.map((row, index) => ({
                rank:
                  intent.page * HIGHSCORE_LIMITS.pageSize + index + 1,
                name: row.name,
                level: row.level,
                vocation: row.vocation,
                value: row.value,
              })),
            };
            this.cache.set(key, {
              expiresAt: at + HIGHSCORE_LIMITS.cacheTtlMs,
              message,
            });
            if (session.playerId === characterId) session.send(message);
          });
        },
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(`highscore load failed (${key}): ${reason}`);
          this.outcomes.push(() => {
            this.pendingBySession.delete(session.id);
            this.fail(session, "unavailable");
          });
        },
      );
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private fail(session: Session, reason: HighscoresActionFailedReason): void {
    session.send({ type: "highscores-action-failed", reason });
  }
}
