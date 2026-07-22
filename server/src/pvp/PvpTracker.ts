import type { CreatureState, SkullMark } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { CombatFeedback } from "../combat/CombatFeedback";
import type { Creature } from "../creature/Creature";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { monotonicNow } from "../monotonicNow";
import { applyFragAndSkull } from "./applyFragAndSkull";
import type { PvpHooks } from "./PvpHooks";
import type { PvpPolicy } from "./PvpPolicy";
import type { PvpRelations } from "./PvpRelations";
import type { PvpKillRecord, PvpStore } from "./PvpStore";
import { resolveKillJustification } from "./resolveKillJustification";
import {
  resolvePlayerAttackConsequence,
  type PlayerAttackContext,
} from "./resolvePlayerAttackConsequence";
import type { SkullState } from "./SkullState";

interface TrackedFrag {
  readonly victimCharacterId: string;
  readonly occurredAtMs: number;
  readonly unjustified: boolean;
  avenged: boolean;
}

interface TrackedPvpState {
  readonly player: Player;
  readonly frags: TrackedFrag[];
  /** targetId -> last aggression at; drives yellow marks + retaliation. */
  readonly attacked: Map<string, number>;
  /** attackerId -> damage taken this life; drives most-damage charging. */
  readonly damageTaken: Map<string, { amount: number; lastAt: number }>;
  inFightUntil: number;
}

const SKULL_RANK: Record<SkullState, number> = {
  none: 0,
  white: 1,
  red: 2,
  black: 3,
};

const TICK_SCAN_INTERVAL_MS = 500;
const PROCESSED_EVENT_RETENTION_MS = 3_600_000;

/**
 * Server-authoritative skull/frag bookkeeping. All game-state mutations run
 * synchronously inside the tick at combat execution time; durable frag and
 * sanction rows are written off-tick through an idempotent store keyed by
 * death event id, so a replayed death can never double-charge (charter
 * rules 3–5, 11). Persistent skulls piggyback on the character save path.
 */
export class PvpTracker implements PvpHooks {
  private readonly states = new Map<string, TrackedPvpState>();
  private readonly processedDeathEvents = new Map<string, number>();
  private readonly pendingWrites = new Set<Promise<void>>();
  private readonly feedback: CombatFeedback;
  private nextScanAt = 0;
  /** Latest tick time seen; projections use this instead of wall clock. */
  private clockMs = 0;

  constructor(
    private readonly policy: PvpPolicy,
    private readonly world: World,
    registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly relations: PvpRelations,
    private readonly store?: PvpStore,
  ) {
    this.feedback = new CombatFeedback(world, registry);
  }

  /** Off-tick login load; prunes durable frags beyond the month window. */
  async load(characterId: string): Promise<ReadonlyArray<PvpKillRecord>> {
    if (!this.store) return [];
    return this.store.loadFrags(
      characterId,
      new Date(monotonicNow() - this.policy.fragExpiryMs),
    );
  }

  /** Runs inside the tick when the player enters the world. */
  attach(
    player: Player,
    frags: ReadonlyArray<PvpKillRecord>,
    now: number,
  ): void {
    const cutoff = now - this.policy.fragExpiryMs;
    const kept: TrackedFrag[] = frags
      .filter((frag) => frag.occurredAtMs >= cutoff)
      .map((frag) => ({ ...frag }));
    this.states.set(player.id, {
      player,
      frags: kept,
      attacked: new Map(),
      damageTaken: new Map(),
      inFightUntil: 0,
    });
    // White skulls are tied to the in-fight window and never survive a
    // relogin; red/black only survive while their expiry is in the future.
    if (
      player.skull === "white" ||
      (player.skull !== "none" &&
        (player.skullExpiresAt === null || player.skullExpiresAt <= now))
    ) {
      player.skull = "none";
      player.skullExpiresAt = null;
      this.persistence.markDirty(player);
    }
    // Crash safety: the durable frags are the source of truth for red and
    // black sanctions. Recompute anchored at the latest frag so a skull
    // that missed its character snapshot is restored (no new audit row —
    // it was written when the sanction happened).
    const times = kept
      .filter((frag) => frag.unjustified)
      .map((frag) => frag.occurredAtMs);
    if (times.length > 0) {
      const outcome = applyFragAndSkull(this.policy, times, Math.max(...times));
      if (
        outcome.skull !== "none" &&
        outcome.expiresAtMs !== null &&
        outcome.expiresAtMs > now &&
        SKULL_RANK[outcome.skull] > SKULL_RANK[player.skull]
      ) {
        player.skull = outcome.skull;
        player.skullExpiresAt = outcome.expiresAtMs;
        this.persistence.markDirty(player);
      }
    }
  }

  /** Runs inside the tick before the player leaves the world. */
  detachCharacter(characterId: string): void {
    this.states.delete(characterId);
  }

  canTarget(session: Session, attacker: Player, target: Player): boolean {
    const consequence = resolvePlayerAttackConsequence(
      this.policy,
      this.contextFor(attacker, target, session.fightMode.secure),
    );
    return consequence.kind === "allow";
  }

  onPlayerAttack(
    attacker: Player,
    target: Player,
    now: number,
  ): "ok" | "blocked" {
    // Secure mode gates targeting/harm selection, not the damage step:
    // area spells only reach here through canPlayerHarm.
    const consequence = resolvePlayerAttackConsequence(
      this.policy,
      this.contextFor(attacker, target, false),
    );
    if (consequence.kind === "refuse") return "blocked";
    this.clockMs = Math.max(this.clockMs, now);
    const state = this.states.get(attacker.id);
    if (!state) return "ok";
    const firstMark = !state.attacked.has(target.id);
    state.attacked.set(target.id, now);
    state.inFightUntil = now + this.policy.combatLockMs;
    if (consequence.assignsWhiteSkull && attacker.skull === "none") {
      this.setSkull(attacker, "white", now + this.policy.whiteSkullDurationMs, now);
    } else if (attacker.skull === "white") {
      // White skulls last whiteSkullDurationMs after the LAST aggression.
      attacker.skullExpiresAt = now + this.policy.whiteSkullDurationMs;
      this.persistence.markDirty(attacker);
    }
    if (firstMark) this.visibility.onCreatureStateChanged(attacker);
    return "ok";
  }

  recordDamageTaken(
    victim: Player,
    attackerId: string,
    amount: number,
    now: number,
  ): void {
    if (amount <= 0 || attackerId === victim.id) return;
    const state = this.states.get(victim.id);
    if (!state) return;
    const entry = state.damageTaken.get(attackerId);
    state.damageTaken.set(attackerId, {
      amount: (entry?.amount ?? 0) + amount,
      lastAt: now,
    });
  }

  handlePlayerDeath(
    victim: Player,
    lastHitSourceId: string | null,
    deathEventId: string,
    now: number,
  ): void {
    if (this.processedDeathEvents.has(deathEventId)) return;
    this.processedDeathEvents.set(deathEventId, now);
    this.clockMs = Math.max(this.clockMs, now);
    const victimState = this.states.get(victim.id);
    const lastHit =
      lastHitSourceId && lastHitSourceId !== victim.id
        ? this.world.getPlayer(lastHitSourceId)
        : undefined;
    const mostDamage = this.mostDamagingPlayer(victimState, victim, now);
    let lastHitUnjustified = false;
    if (lastHit) {
      lastHitUnjustified =
        this.chargeKiller(lastHit, victim, victimState, deathEventId, now) ===
        "unjustified";
    }
    // Canary parity (creature.cpp): the most-damage dealer is charged only
    // when the last hit was not already unjustified.
    if (
      mostDamage &&
      mostDamage.id !== lastHit?.id &&
      !lastHitUnjustified
    ) {
      this.chargeKiller(mostDamage, victim, victimState, deathEventId, now);
    }
    if (victimState) {
      victimState.attacked.clear();
      victimState.damageTaken.clear();
      victimState.inFightUntil = 0;
    }
    if (victim.skull === "white") this.setSkull(victim, "none", null, now);
  }

  applyRespawnState(player: Player): void {
    if (player.skull !== "black") return;
    player.setHealth(
      Math.min(player.maxHealth, this.policy.blackSkullRespawnHealth),
    );
    const drain = player.mana - this.policy.blackSkullRespawnMana;
    if (drain > 0) player.spendMana(drain);
  }

  /**
   * Per-viewer creature-state decoration. Public white/red/black go to all
   * viewers; yellow/orange are computed for THIS recipient only and never
   * leak into another viewer's message.
   */
  decorateCreatureState(
    viewer: Player,
    creature: Creature,
    state: CreatureState,
  ): CreatureState {
    if (!(creature instanceof Player)) return state;
    if (creature.skull !== "none") {
      return { ...state, skull: creature.skull };
    }
    if (creature.id === viewer.id) return state;
    const mark = this.situationalMarkFor(viewer.id, creature.id, this.clockMs);
    return mark ? { ...state, skull: mark } : state;
  }

  tick(now: number): void {
    this.clockMs = Math.max(this.clockMs, now);
    if (now < this.nextScanAt) return;
    this.nextScanAt = now + TICK_SCAN_INTERVAL_MS;
    for (const state of this.states.values()) {
      if (
        state.inFightUntil !== 0 &&
        state.inFightUntil <= now
      ) {
        const hadMarks = state.attacked.size > 0;
        state.attacked.clear();
        state.damageTaken.clear();
        state.inFightUntil = 0;
        // Yellow marks derived from the attacked set vanish with in-fight.
        if (hadMarks) this.visibility.onCreatureStateChanged(state.player);
      }
      const { player } = state;
      if (
        player.skull !== "none" &&
        player.skullExpiresAt !== null &&
        player.skullExpiresAt <= now
      ) {
        this.setSkull(player, "none", null, now);
      }
    }
    for (const [eventId, processedAt] of this.processedDeathEvents) {
      if (now - processedAt > PROCESSED_EVENT_RETENTION_MS) {
        this.processedDeathEvents.delete(eventId);
      }
    }
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingWrites]);
  }

  private contextFor(
    attacker: Player,
    target: Player,
    secureMode: boolean,
  ): PlayerAttackContext {
    const now = this.clockMs;
    const targetHasAttackedAttacker =
      this.states.get(target.id)?.attacked.has(attacker.id) ?? false;
    const targetMarkedToAttacker =
      target.skull !== "none" ||
      targetHasAttackedAttacker ||
      this.situationalMarkFor(attacker.id, target.id, now) === "orange";
    return {
      attackerLevel: attacker.level,
      targetLevel: target.level,
      attackerSkull: attacker.skull,
      targetSkull: target.skull,
      targetHasAttackedAttacker,
      targetMarkedToAttacker,
      sameParty: this.relations.sameParty(attacker.id, target.id),
      sameGuild: this.relations.sameGuild(attacker.id, target.id),
      atWar: this.relations.atWar(attacker.id, target.id),
      secureMode,
      // Dedicated pvp zones do not exist in the map data yet (see TODO.md).
      inPvpZone: false,
      inNoPvpZone:
        this.world.isNoPvpZone(attacker.position) ||
        this.world.isNoPvpZone(target.position),
    };
  }

  private situationalMarkFor(
    viewerId: string,
    subjectId: string,
    now: number,
  ): SkullMark | undefined {
    const subject = this.states.get(subjectId);
    if (!subject) return undefined;
    if (subject.attacked.has(viewerId)) return "yellow";
    if (this.hasUnavengedKillOn(subject, viewerId, now)) return "orange";
    return undefined;
  }

  private hasUnavengedKillOn(
    killerState: TrackedPvpState | undefined,
    victimCharacterId: string,
    now: number,
  ): boolean {
    if (!killerState) return false;
    const cutoff = now - this.policy.orangeSkullDurationMs;
    return killerState.frags.some(
      (frag) =>
        frag.victimCharacterId === victimCharacterId &&
        frag.unjustified &&
        !frag.avenged &&
        frag.occurredAtMs >= cutoff,
    );
  }

  private mostDamagingPlayer(
    victimState: TrackedPvpState | undefined,
    victim: Player,
    now: number,
  ): Player | undefined {
    if (!victimState) return undefined;
    let best: { player: Player; amount: number } | undefined;
    for (const [attackerId, entry] of victimState.damageTaken) {
      if (now - entry.lastAt > this.policy.whiteSkullDurationMs) continue;
      const attacker = this.world.getPlayer(attackerId);
      if (!attacker || attacker.id === victim.id) continue;
      if (!best || entry.amount > best.amount) {
        best = { player: attacker, amount: entry.amount };
      }
    }
    return best?.player;
  }

  private chargeKiller(
    killer: Player,
    victim: Player,
    victimState: TrackedPvpState | undefined,
    deathEventId: string,
    now: number,
  ): "unjustified" | "justified" | "justified-avenge" {
    const justification = resolveKillJustification(this.policy, {
      victimSkull: victim.skull,
      victimAttackedKiller: victimState?.attacked.has(killer.id) ?? false,
      sameParty: this.relations.sameParty(killer.id, victim.id),
      sameGuild: this.relations.sameGuild(killer.id, victim.id),
      atWar: this.relations.atWar(killer.id, victim.id),
      inPvpZone: false,
      victimHasUnavengedKillOnKiller: this.hasUnavengedKillOn(
        victimState,
        killer.id,
        now,
      ),
    });
    let sanction: { skull: "red" | "black"; expiresAt: Date } | null = null;
    if (justification === "unjustified") {
      const killerState = this.states.get(killer.id);
      if (killerState) {
        killerState.frags.push({
          victimCharacterId: victim.id,
          occurredAtMs: now,
          unjustified: true,
          avenged: false,
        });
        const cutoff = now - this.policy.fragExpiryMs;
        const times = killerState.frags
          .filter((frag) => frag.unjustified && frag.occurredAtMs >= cutoff)
          .map((frag) => frag.occurredAtMs);
        const outcome = applyFragAndSkull(this.policy, times, now);
        if (
          outcome.skull !== "none" &&
          SKULL_RANK[outcome.skull] >= SKULL_RANK[killer.skull]
        ) {
          const transitioned = outcome.skull !== killer.skull;
          this.setSkull(killer, outcome.skull, outcome.expiresAtMs, now);
          if (transitioned) {
            sanction = {
              skull: outcome.skull,
              expiresAt: new Date(outcome.expiresAtMs ?? now),
            };
          }
        }
      }
    } else if (justification === "justified-avenge" && victimState) {
      const cutoff = now - this.policy.orangeSkullDurationMs;
      const reverse = victimState.frags
        .filter(
          (frag) =>
            frag.victimCharacterId === killer.id &&
            frag.unjustified &&
            !frag.avenged &&
            frag.occurredAtMs >= cutoff,
        )
        .sort((left, right) => left.occurredAtMs - right.occurredAtMs)[0];
      if (reverse) reverse.avenged = true;
    }
    this.persistKill(killer, victim, deathEventId, now, justification, sanction);
    return justification;
  }

  private persistKill(
    killer: Player,
    victim: Player,
    deathEventId: string,
    now: number,
    justification: "unjustified" | "justified" | "justified-avenge",
    sanction: { skull: "red" | "black"; expiresAt: Date } | null,
  ): void {
    const store = this.store;
    if (!store || this.policy.worldType !== "pvp") return;
    const operation = store
      .recordKill({
        deathEventId,
        killerCharacterId: killer.id,
        victimCharacterId: victim.id,
        occurredAt: new Date(now),
        unjustified: justification === "unjustified",
        avengeCutoff:
          justification === "justified-avenge"
            ? new Date(now - this.policy.orangeSkullDurationMs)
            : null,
        sanction,
      })
      .then(
        () => undefined,
        (cause: unknown) => {
          const reason = cause instanceof Error ? cause.message : "unknown";
          console.warn(
            `failed to persist pvp kill ${deathEventId} by ${killer.id}: ${reason}`,
          );
        },
      );
    this.pendingWrites.add(operation);
    void operation.finally(() => this.pendingWrites.delete(operation));
  }

  private setSkull(
    player: Player,
    skull: SkullState,
    expiresAtMs: number | null,
    now: number,
  ): void {
    if (player.skull === skull && player.skullExpiresAt === expiresAtMs) return;
    player.skull = skull;
    player.skullExpiresAt = expiresAtMs;
    this.persistence.markDirty(player);
    this.visibility.onCreatureStateChanged(player);
    this.feedback.sendFightStateForPlayer(player.id, now);
  }
}
