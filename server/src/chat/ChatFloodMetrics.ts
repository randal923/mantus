/**
 * Observability for chat flood control. Chat bodies are never logged or
 * counted here — only the moderation metadata an operator needs to see a
 * flood happening: how many lines the buffer accepted, how many were
 * refused while a mute was live, and every mute issued with its escalation
 * level. Keeping the counters in one place is what makes "no message
 * content ever leaves the chat path" checkable rather than aspirational.
 */
export interface ChatFloodSnapshot {
  readonly accepted: number;
  readonly dropped: number;
  readonly mutesIssued: number;
  readonly escalationsDecayed: number;
  /** Mutes issued per escalation level; index 0 is the first offence. */
  readonly mutesByLevel: ReadonlyArray<number>;
  readonly mutedMsTotal: number;
}

/** Escalation levels are tracked individually up to this depth, then pooled. */
const MAX_TRACKED_LEVEL = 8;

export class ChatFloodMetrics {
  private accepted = 0;
  private dropped = 0;
  private mutesIssued = 0;
  private escalationsDecayed = 0;
  private mutedMsTotal = 0;
  private readonly mutesByLevel = new Array<number>(MAX_TRACKED_LEVEL).fill(0);

  recordAccepted(): void {
    this.accepted += 1;
  }

  /** A line refused because the speaker was already muted. */
  recordDropped(): void {
    this.dropped += 1;
  }

  recordMute(characterId: string, level: number, durationMs: number): void {
    this.mutesIssued += 1;
    this.mutedMsTotal += durationMs;
    const index = Math.min(level, MAX_TRACKED_LEVEL) - 1;
    if (index >= 0) this.mutesByLevel[index] = (this.mutesByLevel[index] ?? 0) + 1;
    // Metadata only: character id, escalation level, duration. Never the line.
    console.warn(
      `chat flood mute: character=${characterId} level=${level} durationMs=${durationMs}`,
    );
  }

  recordEscalationDecay(): void {
    this.escalationsDecayed += 1;
  }

  snapshot(): ChatFloodSnapshot {
    return {
      accepted: this.accepted,
      dropped: this.dropped,
      mutesIssued: this.mutesIssued,
      escalationsDecayed: this.escalationsDecayed,
      mutesByLevel: [...this.mutesByLevel],
      mutedMsTotal: this.mutedMsTotal,
    };
  }
}
