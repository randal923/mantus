/** One icon's play order and how long Tibia holds each of its frames. */
export interface SpriteSequence {
  frames: ReadonlyArray<number>;
  durations: ReadonlyArray<number>;
  cycleMs: number;
}

export interface ResolvedSpriteFrame {
  spriteId: number;
  /** How long this frame stays up, so the clock can sleep until it changes. */
  remainingMs: number;
}

/** Maps elapsed time onto a sequence; safe to call as often as you like. */
export function resolveSpriteFrame(
  sequence: SpriteSequence,
  elapsedMs: number,
): ResolvedSpriteFrame {
  const { frames, durations, cycleMs } = sequence;
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const offset = elapsed % cycleMs;
  let boundary = 0;
  for (let index = 0; index < frames.length; index++) {
    boundary += durations[index];
    if (offset < boundary) {
      return { spriteId: frames[index], remainingMs: boundary - offset };
    }
  }
  return { spriteId: frames[frames.length - 1], remainingMs: cycleMs };
}
