import { TickLoop } from "./TickLoop";

/**
 * A handler's queue of settled async results, applied in order inside the
 * tick (charter rule 5). Pushing wakes the tick loop the same way a queued
 * client intent does, so a resolved DB round trip is applied immediately
 * instead of waiting out the 25 ms interval — sequential flows (login's ~28
 * round trips above all) otherwise pay that alignment on every round trip.
 * Outcomes pushed while a drain is running are held for the next one.
 */
export class ResolvedOutcomes<Args extends unknown[] = []> {
  private readonly entries: Array<(...args: Args) => void> = [];

  push(outcome: (...args: Args) => void): void {
    this.entries.push(outcome);
    TickLoop.wakeAll();
  }

  applyAll(...args: Args): void {
    for (const outcome of this.entries.splice(0)) outcome(...args);
  }
}
