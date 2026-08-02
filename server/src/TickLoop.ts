import { monotonicNow } from "./monotonicNow";

export class TickLoop {
  private timer: NodeJS.Timeout | undefined;
  private wakeImmediate: NodeJS.Immediate | undefined;
  private wakeTimer: NodeJS.Timeout | undefined;
  private lastTickAt = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly onTick: () => void,
    private readonly minWakeSpacingMs = 5,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.runTick(), this.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    this.cancelWake();
  }

  /**
   * Runs the next tick as soon as possible instead of waiting out the
   * interval. Requests made before the woken tick fires coalesce into one
   * tick, and a wake keeps a minimum spacing from the previous tick so a
   * packet flood cannot turn every message into its own full tick.
   */
  requestTick(): void {
    if (!this.timer || this.wakeImmediate || this.wakeTimer) return;
    const waitMs = this.minWakeSpacingMs - (monotonicNow() - this.lastTickAt);
    if (waitMs > 0) {
      this.wakeTimer = setTimeout(() => this.runTick(), waitMs);
    } else {
      this.wakeImmediate = setImmediate(() => this.runTick());
    }
  }

  private runTick(): void {
    this.cancelWake();
    this.lastTickAt = monotonicNow();
    this.onTick();
  }

  private cancelWake(): void {
    if (this.wakeImmediate) {
      clearImmediate(this.wakeImmediate);
      this.wakeImmediate = undefined;
    }
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = undefined;
    }
  }
}
