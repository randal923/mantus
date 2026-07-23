import { randomUUID } from "node:crypto";

export class EventSequence {
  private counter = 0;

  constructor(private readonly runId: string = randomUUID()) {}

  nextEventId(prefix: string): string {
    this.counter++;
    return `${prefix}:${this.runId}:${this.counter}`;
  }
}
