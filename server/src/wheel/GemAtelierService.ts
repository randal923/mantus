import {
  computeWheelBonuses,
  GEM_ATELIER_LIMITS,
  GEM_BASIC_MODS,
  GEM_DESTROY_YIELDS,
  GEM_DOMAIN_ROTATION,
  GEM_GRADE_COSTS,
  GEM_REVEAL_COSTS,
  GEM_SUPREME_MODS,
  GEM_SWITCH_DOMAIN_COSTS,
  WHEEL_BASE_VOCATION,
  WHEEL_LIMITS,
  type GemAction,
  type GemActionFailedReason,
  type GemActionMessage,
  type GemStateMessage,
  type RevealedGem,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Player } from "../Player";
import { projectOwnProgression } from "../progression/projectOwnProgression";
import type { Session } from "../Session";
import type { World } from "../World";
import type { GemStore, GemTransactionResult } from "./GemStore";
import type { GemTracker } from "./GemTracker";
import { rollRevealedGem } from "./rollRevealedGem";
import type { WheelTracker } from "./WheelTracker";

const MAX_TRACKED_REQUEST_IDS = 64;

/**
 * Gem Atelier + Fragment Workshop actions. Prechecks run synchronously
 * against in-memory state; anything spending gold, gems, or fragments is
 * settled by one ACID store transaction and applied to memory only after
 * commit, inside the tick via applyResolvedOutcomes (charter rules 2-4).
 */
export class GemAtelierService {
  private readonly outcomes: Array<(now: number) => void> = [];
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly cooldownBySession = new Map<string, number>();
  private readonly requestIdsBySession = new Map<string, Set<string>>();
  private readonly busySessions = new Set<string>();
  private readonly goldByCharacter = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly tracker: GemTracker,
    private readonly wheel: WheelTracker,
    private readonly persistence: CharacterPersistence,
    private readonly store?: GemStore,
    private readonly random: () => number = Math.random,
  ) {}

  applyResolvedOutcomes(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingOperations]);
  }

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
    this.requestIdsBySession.delete(session.id);
    this.busySessions.delete(session.id);
    if (session.playerId) this.goldByCharacter.delete(session.playerId);
  }

  /** Pushes fresh state after a kill drop credited by GemDropHooks. */
  notifyResourcesChanged(session: Session, now: number): void {
    const player = session.playerId
      ? this.world.getPlayer(session.playerId)
      : undefined;
    if (player) session.send(this.projectState(player, now));
  }

  handleGet(session: Session, now: number): void {
    const player = this.guard(session, now, GEM_ATELIER_LIMITS.readCooldownMs);
    if (!player) return;
    const store = this.store;
    if (!store) {
      session.send(this.projectState(player, now));
      return;
    }
    this.run(
      store.bankBalance(player.id).then((balance) => ({
        apply: (at: number) => {
          if (session.playerId !== player.id) return;
          this.goldByCharacter.set(player.id, balance);
          session.send(this.projectState(player, at));
        },
      })),
      session,
      player,
    );
  }

  handleAction(session: Session, intent: GemActionMessage, now: number): void {
    const player = this.guard(
      session,
      now,
      GEM_ATELIER_LIMITS.actionCooldownMs,
    );
    if (!player) return;
    if (!this.isUnlocked(player, now)) {
      this.fail(session, "unavailable");
      return;
    }
    const seen = this.requestIdsBySession.get(session.id) ?? new Set<string>();
    if (seen.has(intent.requestId)) {
      session.send(this.projectState(player, now));
      return;
    }
    if (this.busySessions.has(session.id)) {
      this.fail(session, "rate-limited");
      return;
    }
    seen.add(intent.requestId);
    if (seen.size > MAX_TRACKED_REQUEST_IDS) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    this.requestIdsBySession.set(session.id, seen);
    this.dispatch(session, player, intent.action, now);
  }

  private dispatch(
    session: Session,
    player: Player,
    action: GemAction,
    now: number,
  ): void {
    const data = this.tracker.dataFor(player.id);
    switch (action.kind) {
      case "reveal": {
        if ((data.resources[`${action.quality}Gems`] ?? 0) < 1) {
          this.fail(session, "insufficient-gems");
          return;
        }
        if (data.revealed.length >= GEM_ATELIER_LIMITS.maxRevealedGems) {
          this.fail(session, "gem-limit-reached");
          return;
        }
        const gem = rollRevealedGem(
          action.quality,
          WHEEL_BASE_VOCATION[player.vocation],
          this.random,
        );
        this.transact(
          session,
          player,
          (store) =>
            store.reveal(
              player.id,
              action.quality,
              gem,
              GEM_REVEAL_COSTS[action.quality],
            ),
          () => this.tracker.applyReveal(player.id, gem),
        );
        return;
      }
      case "destroy": {
        const gem = this.findGem(session, data.revealed, action.gemId);
        if (!gem || !this.checkMutable(session, data, gem)) return;
        const yieldRule = GEM_DESTROY_YIELDS[gem.quality];
        const amount =
          yieldRule.min +
          Math.floor(this.random() * (yieldRule.max - yieldRule.min + 1));
        this.transact(
          session,
          player,
          (store) => store.destroy(player.id, gem.id, yieldRule.fragment, amount),
          () =>
            this.tracker.applyDestroy(
              player.id,
              gem.id,
              yieldRule.fragment,
              amount,
            ),
        );
        return;
      }
      case "switch-domain": {
        const gem = this.findGem(session, data.revealed, action.gemId);
        if (!gem || !this.checkMutable(session, data, gem)) return;
        const domain = GEM_DOMAIN_ROTATION[gem.domain];
        this.transact(
          session,
          player,
          (store) =>
            store.switchDomain(
              player.id,
              gem.id,
              domain,
              GEM_SWITCH_DOMAIN_COSTS[gem.quality],
            ),
          () => this.tracker.applySwitchDomain(player.id, gem.id, domain),
        );
        return;
      }
      case "toggle-lock": {
        const gem = this.findGem(session, data.revealed, action.gemId);
        if (!gem) return;
        this.tracker.setLocked(player.id, gem.id, !gem.locked);
        session.send(this.projectState(player, now));
        return;
      }
      case "equip": {
        const gem = this.findGem(session, data.revealed, action.gemId);
        if (!gem) return;
        this.tracker.setEquipped(player.id, gem.domain, gem.id);
        this.applyBonuses(session, player, now);
        return;
      }
      case "unequip": {
        this.tracker.setEquipped(player.id, action.domain, null);
        this.applyBonuses(session, player, now);
        return;
      }
      case "improve-grade": {
        const pool =
          action.modKind === "basic"
            ? GEM_BASIC_MODS.some((mod) => mod.id === action.modId)
            : GEM_SUPREME_MODS.some(
                (mod) =>
                  mod.id === action.modId &&
                  (mod.vocations === "all" ||
                    mod.vocations.includes(
                      WHEEL_BASE_VOCATION[player.vocation],
                    )),
              );
        if (!pool) {
          this.fail(session, "gem-not-found");
          return;
        }
        const current =
          data.grades[action.modKind].find(
            (entry) => entry.modId === action.modId,
          )?.grade ?? 0;
        if (current >= GEM_ATELIER_LIMITS.maxGrade) {
          this.fail(session, "max-grade");
          return;
        }
        const cost = GEM_GRADE_COSTS[action.modKind][current];
        if (!cost) {
          this.fail(session, "max-grade");
          return;
        }
        const fragmentKey =
          action.modKind === "basic" ? "lesserFragments" : "greaterFragments";
        if ((data.resources[fragmentKey] ?? 0) < cost.fragments) {
          this.fail(session, "insufficient-fragments");
          return;
        }
        const nextGrade = current + 1;
        this.transact(
          session,
          player,
          (store) =>
            store.improveGrade(
              player.id,
              action.modKind,
              action.modId,
              nextGrade,
              cost.gold,
              cost.fragments,
            ),
          (at) => {
            this.tracker.applyImproveGrade(
              player.id,
              action.modKind,
              action.modId,
              nextGrade,
              cost.fragments,
            );
            this.recomputeBonuses(session, player, at);
          },
        );
        return;
      }
    }
  }

  /** Recomputes and persists wheel+gem bonuses, then reports both states. */
  private applyBonuses(session: Session, player: Player, now: number): void {
    this.recomputeBonuses(session, player, now);
    session.send(this.projectState(player, now));
  }

  private recomputeBonuses(
    session: Session,
    player: Player,
    now: number,
  ): void {
    const data = this.tracker.dataFor(player.id);
    player.setWheelBonuses(
      computeWheelBonuses(this.wheel.slicesFor(player.id), player.vocation, {
        equipped: this.tracker.equippedGems(player.id),
        grades: data.grades,
      }),
    );
    this.persistence.saveNow(player, now);
    session.send({
      type: "progression-updated",
      playerId: player.id,
      progression: projectOwnProgression(player, now),
    });
  }

  private transact(
    session: Session,
    player: Player,
    run: (store: GemStore) => Promise<GemTransactionResult>,
    applyCommitted: (now: number) => void,
  ): void {
    const store = this.store;
    if (!store) {
      this.fail(session, "unavailable");
      return;
    }
    this.busySessions.add(session.id);
    this.run(
      run(store).then((result) => ({
        apply: (at: number) => {
          this.busySessions.delete(session.id);
          if (session.playerId !== player.id) return;
          if (result.status !== "committed") {
            this.fail(session, result.status);
            return;
          }
          if (result.goldAfter !== undefined) {
            this.goldByCharacter.set(player.id, result.goldAfter);
          }
          applyCommitted(at);
          session.send(this.projectState(player, at));
        },
      })),
      session,
      player,
    );
  }

  private run(
    operation: Promise<{ apply: (now: number) => void }>,
    session: Session,
    player: Player,
  ): void {
    const resolution = operation.then(
      (result) => {
        this.outcomes.push(result.apply);
      },
      (cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`gem operation failed for ${player.id}: ${reason}`);
        this.outcomes.push(() => {
          this.busySessions.delete(session.id);
          if (session.playerId !== player.id) return;
          this.fail(session, "unavailable");
        });
      },
    );
    this.pendingOperations.add(resolution);
    void resolution.finally(() => this.pendingOperations.delete(resolution));
  }

  private projectState(player: Player, now: number): GemStateMessage {
    void now;
    const data = this.tracker.dataFor(player.id);
    return {
      type: "wheel-gems-state",
      resources: {
        ...data.resources,
        gold: this.goldByCharacter.get(player.id) ?? 0,
      },
      revealed: data.revealed.map((gem) => ({ ...gem })),
      equipped: { ...data.equipped },
      grades: {
        basic: data.grades.basic.map((entry) => ({ ...entry })),
        supreme: data.grades.supreme.map((entry) => ({ ...entry })),
      },
    };
  }

  private findGem(
    session: Session,
    revealed: ReadonlyArray<RevealedGem>,
    gemId: string,
  ): RevealedGem | null {
    const gem = revealed.find((candidate) => candidate.id === gemId);
    if (!gem) {
      this.fail(session, "gem-not-found");
      return null;
    }
    return gem;
  }

  private checkMutable(
    session: Session,
    data: { equipped: Partial<Record<string, string>> },
    gem: RevealedGem,
  ): boolean {
    if (gem.locked) {
      this.fail(session, "gem-locked");
      return false;
    }
    if (Object.values(data.equipped).includes(gem.id)) {
      this.fail(session, "gem-equipped");
      return false;
    }
    return true;
  }

  private isUnlocked(player: Player, now: number): boolean {
    return player.level >= WHEEL_LIMITS.minLevel && player.isPremiumAt(now);
  }

  private guard(
    session: Session,
    now: number,
    cooldownMs: number,
  ): Player | null {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!player) {
      session.sendError("join-required");
      return null;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return null;
    }
    this.cooldownBySession.set(session.id, now + cooldownMs);
    return player;
  }

  private fail(session: Session, reason: GemActionFailedReason): void {
    session.send({ type: "wheel-gem-failed", reason });
  }
}
