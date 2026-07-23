import { describe, expect, it } from "vitest";
import { EventSequence } from "./EventSequence";

describe("EventSequence", () => {
  it("names events uniquely across server runs", () => {
    const firstRun = new EventSequence("run-a");
    const secondRun = new EventSequence("run-b");

    expect(firstRun.nextEventId("magic:player")).toBe(
      "magic:player:run-a:1",
    );
    expect(firstRun.nextEventId("magic:player")).toBe(
      "magic:player:run-a:2",
    );
    expect(secondRun.nextEventId("magic:player")).toBe(
      "magic:player:run-b:1",
    );
  });
});
