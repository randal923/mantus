/**
 * Server-side chat flood control, modeled on Canary's message buffer:
 * every player may burst a few lines, the buffer refills over time, and
 * overflowing it mutes the player for an escalating duration. The mute
 * escalation counter is keyed by character id and kept for the server's
 * lifetime so relogging does not reset it (charter rule 8).
 */

interface PlayerChatState {
  bufferUsed: number;
  lastDrainAt: number;
  muteCount: number;
  mutedUntil: number;
}

/** Canary: maxMessageBuffer = 4 burst, one slot back every 1.5 s. */
const MESSAGE_BUFFER_CAPACITY = 4;
const MESSAGE_BUFFER_DRAIN_MS = 1_500;
/** Canary: mute lasts 5·n² seconds for the n-th offence. */
const MUTE_BASE_MS = 5_000;

export class ChatRateLimiter {
  private readonly states = new Map<string, PlayerChatState>();

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
    };
    if (state.mutedUntil > now) return state.mutedUntil - now;
    const drained = Math.floor(
      (now - state.lastDrainAt) / MESSAGE_BUFFER_DRAIN_MS,
    );
    if (drained > 0) {
      state.bufferUsed = Math.max(0, state.bufferUsed - drained);
      state.lastDrainAt += drained * MESSAGE_BUFFER_DRAIN_MS;
    }
    if (state.bufferUsed === 0) state.lastDrainAt = now;
    state.bufferUsed += 1;
    if (state.bufferUsed <= MESSAGE_BUFFER_CAPACITY) {
      this.states.set(playerId, state);
      return 0;
    }
    state.muteCount += 1;
    const muteMs = MUTE_BASE_MS * state.muteCount * state.muteCount;
    state.mutedUntil = now + muteMs;
    state.bufferUsed = 0;
    this.states.set(playerId, state);
    return muteMs;
  }
}
