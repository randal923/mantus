import {
  DEFAULT_CHAT_FLOOD_LIMITS,
  type ChatFloodLimits,
} from "./ChatFloodLimits";
import type { ChatFloodMetrics } from "./ChatFloodMetrics";

/**
 * Server-side chat flood control, modeled on Canary's message buffer:
 * every player may burst a few lines, the buffer refills over time, and
 * overflowing it mutes the player for an escalating duration. The mute
 * escalation counter is keyed by character id and kept for the server's
 * lifetime so relogging does not reset it (charter rule 8); it steps back
 * down after a configured stretch of clean behaviour instead.
 *
 * Restart semantics are deliberate and documented: escalation lives only in
 * memory, so a restart forgives repeat offenders. See TODO.md.
 */

interface PlayerChatState {
  bufferUsed: number;
  lastDrainAt: number;
  muteCount: number;
  mutedUntil: number;
  /** When the escalation counter last moved, for decay. */
  escalatedAt: number;
}

export class ChatRateLimiter {
  private readonly states = new Map<string, PlayerChatState>();

  constructor(
    private readonly limits: ChatFloodLimits = DEFAULT_CHAT_FLOOD_LIMITS,
    private readonly metrics?: ChatFloodMetrics,
  ) {}

  /**
   * Registers one outgoing chat line. Returns 0 when the line may be
   * routed, otherwise the number of milliseconds until the mute lifts.
   */
  consume(playerId: string, now: number): number {
    const state = this.states.get(playerId) ?? {
      bufferUsed: 0,
      lastDrainAt: now,
      muteCount: 0,
      mutedUntil: 0,
      escalatedAt: now,
    };
    if (state.mutedUntil > now) {
      this.metrics?.recordDropped();
      return state.mutedUntil - now;
    }
    this.decayEscalation(state, now);
    const drained = Math.floor(
      (now - state.lastDrainAt) / this.limits.bufferDrainMs,
    );
    if (drained > 0) {
      state.bufferUsed = Math.max(0, state.bufferUsed - drained);
      state.lastDrainAt += drained * this.limits.bufferDrainMs;
    }
    if (state.bufferUsed === 0) state.lastDrainAt = now;
    state.bufferUsed += 1;
    if (state.bufferUsed <= this.limits.bufferCapacity) {
      this.states.set(playerId, state);
      this.metrics?.recordAccepted();
      return 0;
    }
    state.muteCount += 1;
    state.escalatedAt = now;
    const muteMs = this.limits.muteBaseMs * state.muteCount * state.muteCount;
    state.mutedUntil = now + muteMs;
    state.bufferUsed = 0;
    this.states.set(playerId, state);
    this.metrics?.recordMute(playerId, state.muteCount, muteMs);
    return muteMs;
  }

  /**
   * One decay window of silence forgives one escalation level. Applied
   * lazily on the next line so it costs nothing per tick, and measured from
   * the last escalation so a long absence cannot wipe the counter in one go.
   */
  private decayEscalation(state: PlayerChatState, now: number): void {
    if (state.muteCount === 0) return;
    const windows = Math.floor(
      (now - state.escalatedAt) / this.limits.escalationDecayMs,
    );
    if (windows <= 0) return;
    const forgiven = Math.min(windows, state.muteCount);
    state.muteCount -= forgiven;
    state.escalatedAt += windows * this.limits.escalationDecayMs;
    for (let index = 0; index < forgiven; index++) {
      this.metrics?.recordEscalationDecay();
    }
  }
}
