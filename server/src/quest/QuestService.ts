import {
  QUEST_LOG_LIMITS,
  type QuestLineGetMessage,
  type QuestLineMission,
  type QuestLogEntry,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { QuestDefinition } from "./QuestDefinition";
import type { QuestStorageAliases } from "./loadQuestStorageAliases";
import {
  missionDescription,
  missionIsCompleted,
  missionIsStarted,
  questIsCompleted,
  questIsStarted,
  type QuestStorageRead,
} from "./evaluateQuestState";

const MIN_VALUE = -2_147_483_648;
const MAX_VALUE = 2_147_483_647;

/**
 * The quest-state platform (Feature 103) on the shipped character_storages
 * substrate. This is the one gameplay write path for storage values: keys
 * canonicalize through the pinned alias map so aliased Canary keys share
 * one row, values stay bounded int32 with -1-erases semantics, the mutation
 * happens in-tick on the live Player, and persistence is dirty-marked so
 * the character save path carries the delta (charter rules 1, 3).
 */
export class QuestService {
  private onChanged?: (player: Player, key: string, value: number) => void;
  private readonly lastLogRequestBySession = new WeakMap<Session, number>();

  constructor(
    private readonly persistence: CharacterPersistence,
    private readonly aliases: QuestStorageAliases,
    private readonly catalog: ReadonlyArray<QuestDefinition> = [],
  ) {}

  /** Feature 104 hook: quest-log projections refresh on every write. */
  setOnStorageChanged(
    listener: (player: Player, key: string, value: number) => void,
  ): void {
    this.onChanged = listener;
  }

  get quests(): ReadonlyArray<QuestDefinition> {
    return this.catalog;
  }

  /** Canonical read; -1 means unset, exactly like Canary getStorageValue. */
  storageValue(player: Player, key: string): number {
    return player.storageValue(this.aliases.canonicalOf(key));
  }

  /**
   * Canonical write inside the tick; writing -1 erases the row. Values are
   * server-authored — nothing here ever accepts a client-supplied value
   * (charter rule 1).
   */
  setStorageValue(player: Player, key: string, value: number): void {
    if (!Number.isInteger(value) || value < MIN_VALUE || value > MAX_VALUE) {
      throw new Error(`quest storage value ${value} is out of range`);
    }
    const canonical = this.aliases.canonicalOf(key);
    if (player.storageValue(canonical) === value) return;
    player.setStorageValue(canonical, value);
    this.persistence.markDirty(player);
    this.onChanged?.(player, canonical, value);
  }

  /** Advances a storage value monotonically; never lowers quest progress. */
  advanceStorageValue(player: Player, key: string, value: number): boolean {
    if (this.storageValue(player, key) >= value) return false;
    this.setStorageValue(player, key, value);
    return true;
  }

  /** Canary 0xF0: started quests only, evaluated over the owner's storages. */
  handleLogGet(session: Session, player: Player, now: number): void {
    if (this.logRateLimited(session, now)) return;
    const read = this.readerFor(player);
    const quests: QuestLogEntry[] = [];
    for (const quest of this.catalog) {
      if (!questIsStarted(quest, read)) continue;
      quests.push({
        questId: quest.questId,
        name: quest.name,
        completed: questIsCompleted(quest, read),
      });
      if (quests.length >= QUEST_LOG_LIMITS.maxQuests) break;
    }
    session.send({ type: "quest-log", quests });
  }

  /** Canary 0xF1: started missions of one quest, with live descriptions. */
  handleLineGet(
    session: Session,
    player: Player,
    intent: QuestLineGetMessage,
    now: number,
  ): void {
    if (this.logRateLimited(session, now)) return;
    const quest = this.catalog.find(
      (entry) => entry.questId === intent.questId,
    );
    const read = this.readerFor(player);
    if (!quest || !questIsStarted(quest, read)) {
      session.send({ type: "quest-log-failed", reason: "invalid-request" });
      return;
    }
    const missions: QuestLineMission[] = [];
    for (const mission of quest.missions) {
      if (!missionIsStarted(quest, mission, read)) continue;
      missions.push({
        missionId: mission.missionId,
        name: mission.name,
        completed: missionIsCompleted(mission, read),
        description: missionDescription(mission, read).slice(
          0,
          QUEST_LOG_LIMITS.maxDescriptionLength,
        ),
      });
      if (missions.length >= QUEST_LOG_LIMITS.maxMissions) break;
    }
    session.send({
      type: "quest-line",
      questId: quest.questId,
      name: quest.name,
      missions,
    });
  }

  private readerFor(player: Player): QuestStorageRead {
    return (key) => player.storageValue(this.aliases.canonicalOf(key));
  }

  private logRateLimited(session: Session, now: number): boolean {
    const last = this.lastLogRequestBySession.get(session) ?? 0;
    if (now - last < QUEST_LOG_LIMITS.requestCooldownMs) {
      session.send({ type: "quest-log-failed", reason: "rate-limited" });
      return true;
    }
    this.lastLogRequestBySession.set(session, now);
    return false;
  }
}
