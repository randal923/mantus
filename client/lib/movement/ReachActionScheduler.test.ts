import { describe, expect, it, vi } from "vitest";
import { ReachActionScheduler } from "./ReachActionScheduler";

const at = (x: number, y: number, z = 7) => ({ x, y, z });

describe("ReachActionScheduler", () => {
  it("runs immediately and does not walk when already in reach", () => {
    const autoWalk = vi.fn();
    const scheduler = new ReachActionScheduler(autoWalk);
    const act = vi.fn();

    scheduler.request(at(5, 5), at(6, 6), act);

    expect(autoWalk).not.toHaveBeenCalled();
    expect(act).toHaveBeenCalledTimes(1);
  });

  it("walks toward an out-of-reach target and retries once on arrival", () => {
    const autoWalk = vi.fn();
    const scheduler = new ReachActionScheduler(autoWalk);
    const act = vi.fn();

    scheduler.request(at(5, 5), at(9, 5), act);
    expect(autoWalk).toHaveBeenCalledWith(["east", "east", "east"]);
    expect(act).not.toHaveBeenCalled();

    // Still out of reach mid-walk: no retry yet.
    scheduler.onMoved(at(6, 5));
    scheduler.onMoved(at(7, 5));
    expect(act).not.toHaveBeenCalled();

    // Adjacent to (9,5): fires exactly once.
    scheduler.onMoved(at(8, 5));
    expect(act).toHaveBeenCalledTimes(1);

    // Further moves do not fire again — no loop.
    scheduler.onMoved(at(9, 5));
    scheduler.onMoved(at(8, 5));
    expect(act).toHaveBeenCalledTimes(1);
  });

  it("drops the deferred action when cancelled or superseded", () => {
    const autoWalk = vi.fn();
    const scheduler = new ReachActionScheduler(autoWalk);
    const first = vi.fn();
    const second = vi.fn();

    scheduler.request(at(5, 5), at(9, 5), first);
    scheduler.cancel();
    scheduler.onMoved(at(8, 5));
    expect(first).not.toHaveBeenCalled();

    // A new request supersedes any earlier pending action.
    scheduler.request(at(5, 5), at(1, 5), second);
    scheduler.request(at(5, 5), at(9, 5), first);
    scheduler.onMoved(at(8, 5));
    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
  });
});
