export class TickLoop {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly intervalMs: number,
    private readonly onTick: () => void,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(this.onTick, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
