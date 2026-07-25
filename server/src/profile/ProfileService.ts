import {
  PROFILE_LIMITS,
  type AchievementEntry,
  type BadgeEntry,
  type BugReportMessage,
  type CharacterProfileGetMessage,
  type ProfileActionFailedReason,
  type ProfileSelectTitleMessage,
  type TitleEntry,
} from "@tibia/protocol";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { World } from "../World";
import {
  ACHIEVEMENTS,
  BADGE_NAMES,
  TITLE_NAMES,
} from "./achievementCatalog";
import type { ProfileSnapshot, ProfileStore } from "./ProfileStore";

type ProfileIntent =
  | CharacterProfileGetMessage
  | ProfileSelectTitleMessage
  | BugReportMessage;

const MILESTONE_SCAN_INTERVAL_MS = 5_000;

/**
 * Achievements, titles, badges, and the public profile projection.
 *
 * Grants are server-side only: the client never names an achievement. Level
 * milestones are granted by a periodic sweep over the server's own level
 * values, and other systems call `grant` from their own committed outcomes.
 * The store's primary key makes every grant exactly-once, so a replayed event
 * or two racing grant paths still announce the achievement once.
 *
 * The public projection is deliberately narrow — name, level, vocation,
 * guild, granted achievements/badges and the displayed title — and is built
 * from the store, not from any live session, so it reveals nothing about
 * whether the character is online or where they are (charter rule 6).
 */
export class ProfileService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly bugReportReadyAt = new Map<string, number>();
  private readonly snapshots = new Map<string, ProfileSnapshot>();
  private nextMilestoneScanAt = 0;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly guildNameOf: (characterId: string) => string | null,
    private readonly store?: ProfileStore,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
    this.bugReportReadyAt.delete(session.id);
  }

  attachCharacter(session: Session, characterId: string): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store.loadSnapshot(characterId).then(
        (snapshot) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            this.snapshots.set(characterId, snapshot);
            this.sendState(session, characterId);
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  detachCharacter(characterId: string): void {
    this.snapshots.delete(characterId);
  }

  /** Level-milestone sweep; the store's key makes repeats harmless. */
  tick(now: number): void {
    if (!this.store || now < this.nextMilestoneScanAt) return;
    this.nextMilestoneScanAt = now + MILESTONE_SCAN_INTERVAL_MS;
    for (const player of this.world.allPlayers()) {
      const owned = this.snapshots.get(player.id);
      if (!owned) continue;
      for (const definition of ACHIEVEMENTS.values()) {
        if (definition.levelRequirement === undefined) continue;
        if (player.level < definition.levelRequirement) continue;
        if (owned.achievements.includes(definition.achievementId)) continue;
        this.grant(player.id, definition.achievementId);
      }
    }
  }

  /**
   * Grants one catalog achievement. Safe to call from any committed outcome:
   * an unknown id is ignored, and the store reports whether this call was the
   * one that granted it, so the notice fires once.
   */
  grant(characterId: string, achievementId: string): void {
    const store = this.store;
    const definition = ACHIEVEMENTS.get(achievementId);
    if (!store || !definition) return;
    this.track(
      store
        .grantAchievement({
          characterId,
          achievementId,
          ...(definition.titleId ? { titleId: definition.titleId } : {}),
        })
        .then(
          (result) => {
            this.outcomes.push(() => {
              const owned = this.snapshots.get(characterId);
              if (owned) {
                this.snapshots.set(characterId, {
                  ...owned,
                  achievements: [...owned.achievements, achievementId],
                  titles: definition.titleId
                    ? [...new Set([...owned.titles, definition.titleId])]
                    : owned.titles,
                });
              }
              if (!result.granted) return;
              const session = this.registry.sessionFor(characterId);
              if (session?.playerId !== characterId) return;
              session.send({
                type: "achievement-granted",
                achievementId,
                name: definition.name,
                points: definition.points,
              });
              this.sendState(session, characterId);
            });
          },
          (cause: unknown) => this.warn(characterId, cause),
        ),
    );
  }

  handle(session: Session, intent: ProfileIntent, now: number): void {
    const characterId = session.playerId;
    const player = characterId ? this.world.getPlayer(characterId) : undefined;
    if (!characterId || !player) {
      session.sendError("join-required");
      return;
    }
    const store = this.store;
    if (!store) {
      this.fail(session, "invalid-request");
      return;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return;
    }
    this.cooldownBySession.set(
      session.id,
      now + PROFILE_LIMITS.lookupCooldownMs,
    );
    if (intent.type === "character-profile-get") {
      this.sendPublicProfile(session, intent.name);
      return;
    }
    if (intent.type === "profile-select-title") {
      this.selectTitle(session, characterId, intent.titleId);
      return;
    }
    this.reportBug(session, characterId, player.position, intent, now);
  }

  private sendPublicProfile(session: Session, name: string): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store.loadPublicProfile(name).then(
        (record) => {
          this.outcomes.push(() => {
            if (!record) {
              this.fail(session, "not-found");
              return;
            }
            const granted = new Set(record.achievements);
            session.send({
              type: "character-profile",
              name: record.name,
              level: record.level,
              vocation: record.vocation,
              guildName: this.guildNameOf(record.characterId),
              title: record.selectedTitle
                ? (TITLE_NAMES.get(record.selectedTitle) ?? null)
                : null,
              points: this.pointsFor(record.achievements),
              // Only granted achievements are public; the catalog itself is
              // not enumerated to strangers.
              achievements: this.achievementEntries(granted, true),
              badges: this.badgeEntries(record.badges),
            });
          });
        },
        (cause: unknown) => this.warn("public-profile", cause),
      ),
    );
  }

  private selectTitle(
    session: Session,
    characterId: string,
    titleId: string | null,
  ): void {
    const store = this.store;
    if (!store) return;
    this.track(
      store.selectTitle({ characterId, titleId }).then(
        (result) => {
          this.outcomes.push(() => {
            if (this.registry.sessionFor(characterId) !== session) return;
            if (result.status === "failed") {
              this.fail(session, result.reason);
              return;
            }
            const owned = this.snapshots.get(characterId);
            if (owned) {
              this.snapshots.set(characterId, {
                ...owned,
                selectedTitle: titleId,
              });
            }
            this.sendState(session, characterId);
          });
        },
        (cause: unknown) => this.warn(characterId, cause),
      ),
    );
  }

  private reportBug(
    session: Session,
    characterId: string,
    position: { x: number; y: number; z: number },
    intent: BugReportMessage,
    now: number,
  ): void {
    const store = this.store;
    if (!store) return;
    const readyAt = this.bugReportReadyAt.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return;
    }
    this.bugReportReadyAt.set(
      session.id,
      now + PROFILE_LIMITS.bugReportMinIntervalMs,
    );
    this.track(
      store
        .createBugReport({
          characterId,
          category: intent.category,
          message: intent.message,
          // Server-derived: the client never says where it was.
          position: { x: position.x, y: position.y, z: position.z },
          maxPerDay: PROFILE_LIMITS.bugReportMaxPerDay,
        })
        .then(
          (result) => {
            this.outcomes.push(() => {
              if (this.registry.sessionFor(characterId) !== session) return;
              if (result.status === "failed") {
                this.fail(session, result.reason);
                return;
              }
              session.send({
                type: "server-notice",
                category: "talkaction",
                text: "Thank you, your report has been recorded.",
              });
            });
          },
          (cause: unknown) => this.warn(characterId, cause),
        ),
    );
  }

  private sendState(session: Session, characterId: string): void {
    const snapshot = this.snapshots.get(characterId);
    if (!snapshot) return;
    const granted = new Set(snapshot.achievements);
    const titles: TitleEntry[] = [...TITLE_NAMES].map(([titleId, name]) => ({
      titleId,
      name,
      granted: snapshot.titles.includes(titleId),
    }));
    session.send({
      type: "profile-state",
      achievements: this.achievementEntries(granted, false),
      titles,
      badges: this.badgeEntries(snapshot.badges),
      selectedTitle: snapshot.selectedTitle,
      points: this.pointsFor(snapshot.achievements),
    });
  }

  private achievementEntries(
    granted: ReadonlySet<string>,
    onlyGranted: boolean,
  ): AchievementEntry[] {
    const entries: AchievementEntry[] = [];
    for (const definition of ACHIEVEMENTS.values()) {
      const owned = granted.has(definition.achievementId);
      if (onlyGranted && !owned) continue;
      entries.push({
        achievementId: definition.achievementId,
        name: definition.name,
        description: definition.description,
        grade: definition.grade,
        points: definition.points,
        granted: owned,
      });
    }
    return entries;
  }

  private badgeEntries(badges: ReadonlyArray<string>): BadgeEntry[] {
    return badges.flatMap((badgeId) => {
      const name = BADGE_NAMES.get(badgeId);
      return name ? [{ badgeId, name }] : [];
    });
  }

  private pointsFor(achievements: ReadonlyArray<string>): number {
    return achievements.reduce(
      (total, id) => total + (ACHIEVEMENTS.get(id)?.points ?? 0),
      0,
    );
  }

  private fail(session: Session, reason: ProfileActionFailedReason): void {
    session.send({ type: "profile-action-failed", reason });
  }

  private track(operation: Promise<void>): void {
    this.pendingOperations.add(operation);
    void operation.finally(() => this.pendingOperations.delete(operation));
  }

  private warn(context: string, cause: unknown): void {
    const reason = cause instanceof Error ? cause.message : "unknown";
    console.warn(`profile operation failed (${context}): ${reason}`);
  }
}
