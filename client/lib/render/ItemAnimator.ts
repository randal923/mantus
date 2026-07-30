import type { ItemAnimationSchedule } from "./getItemAnimationSchedule";

/**
 * One running animation, ported from OTClient's `Animator` (`animator.cpp`).
 *
 * Time is fed in as frame deltas, so an animation starts when its item appears
 * — which is what makes a play-once schedule (a platform rising out of the
 * water) play, and what keeps a wall of fire fields from being resolved off one
 * global clock. Each phase's hold time is re-rolled inside its `[min, max]`
 * window on every transition, exactly as `Animator::getPhaseDuration` does, so
 * a torch that Tibia says idles for 2000–5000ms does not tick like a metronome.
 * The roll comes from a seeded generator so one instance replays identically.
 *
 * Like `Animator::getPhase`, at most one phase boundary is crossed per call and
 * the overshoot is carried into the next hold, so a stalled frame catches up
 * over the frames that follow instead of skipping ahead.
 */
export class ItemAnimator {
  private phaseValue: number;
  private remaining: number;
  private forward = true;
  private loop = 0;
  private completed = false;
  private randomState: number;

  constructor(
    private readonly schedule: ItemAnimationSchedule,
    seed: number,
  ) {
    this.randomState = (Number.isFinite(seed) ? seed : 0) >>> 0;
    const { startPhase, phaseDurations } = schedule;
    this.phaseValue =
      startPhase === null
        ? Math.min(
            phaseDurations.length - 1,
            Math.floor(this.nextRandom() * phaseDurations.length),
          )
        : startPhase;
    this.remaining = this.durationOf(this.phaseValue);
  }

  get phase(): number {
    return this.phaseValue;
  }

  /** Time until the next phase boundary; Infinity once the loops are spent. */
  get remainingMs(): number {
    return this.completed ? Number.POSITIVE_INFINITY : this.remaining;
  }

  get complete(): boolean {
    return this.completed;
  }

  /** Advances by one frame; true when the drawn phase changed. */
  advance(deltaMs: number): boolean {
    if (this.completed) return false;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return false;
    this.remaining -= deltaMs;
    if (this.remaining > 0) return false;

    const next =
      this.schedule.loopType === "ping-pong"
        ? this.pingPongPhase()
        : this.loopPhase();
    if (next === this.phaseValue) {
      // A counted schedule that ran out of loops freezes on its last phase.
      this.completed = true;
      return false;
    }
    const overshoot = -this.remaining;
    this.phaseValue = next;
    this.remaining = Math.max(0, this.durationOf(next) - overshoot);
    return true;
  }

  private pingPongPhase(): number {
    const count = this.schedule.phaseDurations.length;
    let step = this.forward ? 1 : -1;
    const next = this.phaseValue + step;
    if (next < 0 || next >= count) {
      this.forward = !this.forward;
      step *= -1;
    }
    return this.phaseValue + step;
  }

  private loopPhase(): number {
    const count = this.schedule.phaseDurations.length;
    const next = this.phaseValue + 1;
    if (next < count) return next;
    if (this.schedule.loopType !== "counted") return 0;
    if (this.loop < this.schedule.loopCount - 1) {
      this.loop += 1;
      return 0;
    }
    return this.phaseValue;
  }

  private durationOf(phase: number): number {
    const window = this.schedule.phaseDurations[phase];
    if (!window) return 0;
    const [minimum, maximum] = window;
    if (maximum <= minimum) return minimum;
    return minimum + Math.floor(this.nextRandom() * (maximum - minimum + 1));
  }

  /** mulberry32: one small, stable generator per instance. */
  private nextRandom(): number {
    this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
    let value = this.randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}
