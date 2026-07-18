/** Outcomes of resolved item operations, applied in order inside the tick. */
export class ItemOutcomeQueue {
  private readonly outcomes: Array<(now: number) => void> = [];

  push(outcome: (now: number) => void): void {
    this.outcomes.push(outcome);
  }

  applyAll(now: number): void {
    for (const outcome of this.outcomes.splice(0)) outcome(now);
  }
}
