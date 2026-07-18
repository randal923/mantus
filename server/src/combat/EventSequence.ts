export class EventSequence {
  private counter = 0;

  nextEventId(prefix: string): string {
    this.counter++;
    return `${prefix}:${this.counter}`;
  }
}
