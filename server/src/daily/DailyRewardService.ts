import {
  DAILY_REWARD_RULES,
  DAILY_REWARD_TABLE,
  type DailyActionFailedReason,
  type DailyClaimMessage,
  type DailyRewardPoolEntry,
  type Position,
} from "@tibia/protocol";
import { localDayKey } from "../boosted/localDayKey";
import { carriedWeight } from "../depot/carriedWeight";
import { isNear } from "../item/isNear";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import { LoginLoadQueue } from "../character/LoginLoadQueue";
import { assessDailyStreak } from "./assessDailyStreak";
import { claimDailyStreak } from "./claimDailyStreak";
import type {
  DailyClaimItemGrant,
  DailyRewardSnapshot,
  DailyRewardStore,
} from "./DailyRewardStore";
import {
  dailyRewardPoolFor,
  EXERCISE_WEAPON_POOL,
} from "./dailyRewardPools";
import { localDayEndMs } from "./localDayEndMs";
import { validateDailyRewardPicks } from "./validateDailyRewardPicks";
import { ResolvedOutcomes } from "../ResolvedOutcomes";

/**
 * Daily rewards (Feature 84, Canary daily_reward.lua). The shrine use
 * projects today's state and pool to the owner; the claim re-checks the
 * shrine reach, pool membership, the unit allowance and the once-per-day
 * gate at execution time, and every reward leg commits in one audited
 * store transaction (charter rules 1, 2, 4, 11).
 */
export class DailyRewardService {
  private readonly outcomes = new ResolvedOutcomes<[number]>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly recordsByCharacter = new Map<string, DailyRewardSnapshot>();
  private readonly accessBySession = new WeakMap<Session, Position>();
  private readonly lastClaimBySession = new WeakMap<Session, number>();
  private readonly lastHistoryBySession = new WeakMap<Session, number>();
  private readonly lastStateBySession = new WeakMap<Session, number>();
  private readonly claimsInFlight = new Set<string>();

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly items: ItemIntentHandler,
    private readonly catalog: ItemCatalog,
    private readonly preyHooks?: {
      applyWildcardBalance(characterId: string, balance: number): void;
    },
    private readonly store?: DailyRewardStore,
    private readonly loginLoads: LoginLoadQueue = new LoginLoadQueue(),
  ) {}

  applyResolvedOutcomes(now: number): void {
    this.outcomes.applyAll(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    const loaded = this.loginLoads.run(characterId, () =>
      store.load(characterId),
    );
    this.track(
      loaded.then(
        (snapshot) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.setRecord(characterId, snapshot);
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  detachCharacter(characterId: string): void {
    this.recordsByCharacter.delete(characterId);
  }

  /** Milliseconds of XP boost still running, for the character panel. */
  xpBoostUntilMs(characterId: string): number {
    return this.recordsByCharacter.get(characterId)?.xpBoostUntilMs ?? 0;
  }

  /**
   * Adopts an XP boost deadline the Mantus Store already committed. The store
   * extends this same row rather than keeping a second timer, so the
   * kill-experience path needs no new branch and a character can never carry
   * two boosts at once.
   */
  applyXpBoost(characterId: string, untilMs: number): void {
    const record = this.recordsByCharacter.get(characterId);
    // A character whose streak row has not loaded yet still gets the boost it
    // paid for: the deadline is the only field the experience path reads, and
    // the durable row already carries it.
    this.setRecord(
      characterId,
      record
        ? { ...record, xpBoostUntilMs: untilMs }
        : {
            streakPosition: 0,
            streakLevel: 0,
            jokerTokens: 0,
            lastClaimDay: null,
            lastJokerMonth: null,
            xpBoostUntilMs: untilMs,
          },
    );
  }

  /**
   * The single writer for a character's streak record. It also mirrors the XP
   * boost deadline and the streak level onto the live player, so the character
   * panel's rate breakdown, the kill-experience path and the resting-area
   * bonuses in the progression tick can never disagree with this record.
   */
  private setRecord(characterId: string, record: DailyRewardSnapshot): void {
    this.recordsByCharacter.set(characterId, record);
    const player = this.world.getPlayer(characterId);
    if (!player) return;
    player.setXpBoostUntilMs(record.xpBoostUntilMs);
    player.setDailyStreakLevel(record.streakLevel);
  }

  /** Day-7 boost for the kill-experience path; zero once expired. */
  xpBoostPercent(characterId: string, nowMs: number): number {
    const record = this.recordsByCharacter.get(characterId);
    if (!record || record.xpBoostUntilMs <= nowMs) return 0;
    return DAILY_REWARD_RULES.xpBoostPercent;
  }

  /** World-action entry: project today's state to the using session. */
  openShrine(
    session: Session,
    player: Player,
    position: Position,
    now: number,
  ): void {
    this.accessBySession.set(session, position);
    this.sendState(session, player, now);
  }

  handleClaim(session: Session, intent: DailyClaimMessage, now: number): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    const store = this.store;
    if (!player || !playerId || !store) {
      this.fail(session, "invalid-request");
      return;
    }
    const lastClaim = this.lastClaimBySession.get(session) ?? 0;
    if (now - lastClaim < DAILY_REWARD_RULES.claimCooldownMs) {
      this.fail(session, "rate-limited");
      return;
    }
    this.lastClaimBySession.set(session, now);
    if (
      session.itemOperationPending ||
      session.itemPersistsPending > 0 ||
      this.claimsInFlight.has(playerId)
    ) {
      this.fail(session, "busy");
      return;
    }
    const opened = this.accessBySession.get(session);
    if (!opened || !isNear(player.position, opened)) {
      this.fail(session, "out-of-reach");
      return;
    }
    const record = this.recordsByCharacter.get(playerId);
    if (!record) {
      this.fail(session, "busy");
      return;
    }
    const todayKey = localDayKey(now);
    const assessment = assessDailyStreak(record, todayKey);
    if (!assessment.claimable) {
      this.fail(session, "already-claimed");
      return;
    }
    const claim = claimDailyStreak(assessment.settled, todayKey);
    const entry = DAILY_REWARD_TABLE[claim.rewardDay - 1];
    if (!entry) {
      this.fail(session, "invalid-request");
      return;
    }
    const allowance =
      player.accountTierAt(now) === "premium" ? entry.premium : entry.free;
    const items = validateDailyRewardPicks(
      this.catalog,
      player.vocation,
      entry.kind,
      intent.picks,
      allowance,
    );
    if (items === null) {
      this.fail(session, "invalid-picks");
      return;
    }
    if (items.length > 0 && !this.hasRoomFor(playerId, items)) {
      this.fail(session, "no-space");
      return;
    }
    const wildcards = entry.kind === "wildcards" ? allowance : 0;
    const xpBoostMinutes = entry.kind === "xp-boost" ? allowance : 0;
    session.itemOperationPending = true;
    this.claimsInFlight.add(playerId);
    const resolution = store
      .claim({
        characterId: playerId,
        todayKey,
        expectedRewardDay: claim.rewardDay,
        kind: entry.kind,
        allowance,
        items,
        wildcards,
        xpBoostMinutes,
        nowMs: now,
      })
      .then(
        (result) => {
          this.outcomes.push((at) => {
            this.claimsInFlight.delete(playerId);
            if (result.status === "committed" && result.mutation) {
              this.items.applyCommittedMutation(
                session,
                playerId,
                result.mutation,
                at,
              );
            }
            if (session.playerId !== playerId) return;
            session.itemOperationPending = false;
            if (result.status === "committed") {
              this.setRecord(playerId, result.state);
              if (result.wildcardsAfter !== null) {
                this.preyHooks?.applyWildcardBalance(
                  playerId,
                  result.wildcardsAfter,
                );
              }
              session.send({
                type: "combat-log",
                kind: "condition",
                text: "You have collected your daily reward.",
              });
              const livePlayer = this.world.getPlayer(playerId);
              if (livePlayer) this.sendState(session, livePlayer, at);
              return;
            }
            if (result.status === "already-claimed") {
              this.fail(session, "already-claimed");
            } else if (result.status === "no-space") {
              this.fail(session, "no-space");
            } else {
              this.fail(session, "invalid-request");
            }
            const livePlayer = this.world.getPlayer(playerId);
            if (livePlayer) this.sendState(session, livePlayer, at);
          });
        },
        (cause: unknown) => {
          this.warn(playerId, cause);
          this.outcomes.push(() => {
            this.claimsInFlight.delete(playerId);
            if (session.playerId !== playerId) return;
            session.itemOperationPending = false;
            this.fail(session, "invalid-request");
          });
        },
      );
    this.track(resolution);
    this.items.trackExternalOperation(playerId, resolution);
  }

  /**
   * Re-projects the open window's own state once its countdown expires: the
   * server-local day has flipped, so today's reward is claimable again and
   * the deadline moved. Same gate as the history request — the window must
   * have been opened at a shrine, and one request per second — and the same
   * reasoning for skipping the reach check: this is the caller's own state,
   * and the claim itself re-checks reach at execution time.
   */
  handleStateGet(session: Session, now: number): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!player || !this.accessBySession.has(session)) {
      this.fail(session, "invalid-request");
      return;
    }
    const last = this.lastStateBySession.get(session) ?? 0;
    if (now - last < DAILY_REWARD_RULES.stateCooldownMs) {
      this.fail(session, "rate-limited");
      return;
    }
    this.lastStateBySession.set(session, now);
    this.sendState(session, player, now);
  }

  /**
   * Projects this character's own last claims (charter rule 6). Requires the
   * session to have opened a shrine — the History button only exists inside
   * that window — and is rate-limited, but needs no reach check: a player
   * reading their own history from across the room reveals nothing.
   */
  handleHistoryGet(session: Session, now: number): void {
    const playerId = session.playerId;
    const store = this.store;
    if (!playerId || !store || !this.accessBySession.has(session)) {
      this.fail(session, "invalid-request");
      return;
    }
    const last = this.lastHistoryBySession.get(session) ?? 0;
    if (now - last < DAILY_REWARD_RULES.historyCooldownMs) {
      this.fail(session, "rate-limited");
      return;
    }
    this.lastHistoryBySession.set(session, now);
    this.track(
      store.history(playerId, DAILY_REWARD_RULES.historyLimit).then(
        (records) => {
          this.outcomes.push(() => {
            if (session.playerId !== playerId) return;
            session.send({
              type: "daily-reward-history",
              entries: records.map((record) => ({
                claimedAtMs: record.claimedAtMs,
                rewardDay: record.rewardDay,
                kind: record.kind,
                allowance: record.allowance,
                items: record.items.flatMap((item) => {
                  const type = this.catalog.get(item.typeId);
                  if (!type) return [];
                  return [
                    {
                      itemTypeId: item.typeId,
                      name: type.name,
                      count: item.count,
                    },
                  ];
                }),
              })),
            });
          });
        },
        (cause: unknown) => {
          this.warn(playerId, cause);
          this.outcomes.push(() => {
            if (session.playerId !== playerId) return;
            this.fail(session, "invalid-request");
          });
        },
      ),
    );
  }

  private sendState(session: Session, player: Player, now: number): void {
    const record =
      this.recordsByCharacter.get(player.id) ?? {
        streakPosition: 0,
        streakLevel: 0,
        jokerTokens: 0,
        lastClaimDay: null,
        lastJokerMonth: null,
        xpBoostUntilMs: 0,
      };
    const todayKey = localDayKey(now);
    const assessment = assessDailyStreak(record, todayKey);
    const rewardDay = assessment.settled.streakPosition + 1;
    const entry = DAILY_REWARD_TABLE[rewardDay - 1];
    if (!entry) return;
    const accountTier = player.accountTierAt(now);
    const allowance = accountTier === "premium" ? entry.premium : entry.free;
    session.send({
      type: "daily-rewards-state",
      streakPosition: assessment.settled.streakPosition,
      streakLevel: assessment.settled.streakLevel,
      jokerTokens: assessment.settled.jokerTokens,
      claimableToday: assessment.claimable,
      missedDays: assessment.missedDays,
      xpBoostUntilMs: record.xpBoostUntilMs,
      dayEndsAtMs: localDayEndMs(now),
      accountTier,
      pool: this.poolFor(player, entry.kind),
      allowance,
    });
  }

  private poolFor(
    player: Player,
    kind: (typeof DAILY_REWARD_TABLE)[number]["kind"],
  ): DailyRewardPoolEntry[] {
    const ids =
      kind === "vocation-items"
        ? dailyRewardPoolFor(player.vocation)
        : kind === "training-items"
          ? EXERCISE_WEAPON_POOL
          : [];
    const pool: DailyRewardPoolEntry[] = [];
    for (const itemTypeId of ids) {
      const type = this.catalog.get(itemTypeId);
      if (!type) continue;
      pool.push({ itemTypeId, name: type.name, spriteId: type.spriteId });
    }
    return pool;
  }

  private hasRoomFor(
    characterId: string,
    items: ReadonlyArray<DailyClaimItemGrant>,
  ): boolean {
    const snapshot = this.items.inventorySnapshot(characterId);
    if (!snapshot) return false;
    const weight = items.reduce(
      (total, item) =>
        total + (this.catalog.get(item.typeId)?.weight ?? 0) * item.count,
      0,
    );
    return (
      carriedWeight(this.catalog, snapshot.items) + weight <=
      snapshot.capacityMax * 100
    );
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(characterId: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`daily reward operation failed for ${characterId}: ${reason}`);
  }

  private fail(session: Session, reason: DailyActionFailedReason): void {
    session.send({ type: "daily-action-failed", reason });
  }
}
