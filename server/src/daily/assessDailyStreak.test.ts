import { describe, expect, it } from "vitest";
import { assessDailyStreak, type DailyStreakRecord } from "./assessDailyStreak";
import { claimDailyStreak } from "./claimDailyStreak";

const BASE: DailyStreakRecord = {
  streakPosition: 3,
  streakLevel: 10,
  jokerTokens: 0,
  lastClaimDay: "2026-07-20",
  lastJokerMonth: "2026-07",
};

describe("assessDailyStreak", () => {
  it("blocks a second claim on the same day", () => {
    const assessment = assessDailyStreak(BASE, "2026-07-20");
    expect(assessment.claimable).toBe(false);
  });

  it("continues an unbroken streak", () => {
    const assessment = assessDailyStreak(BASE, "2026-07-21");
    expect(assessment.claimable).toBe(true);
    expect(assessment.missedDays).toBe(0);
    expect(assessment.settled.streakLevel).toBe(10);
    const claim = claimDailyStreak(assessment.settled, "2026-07-21");
    expect(claim.rewardDay).toBe(4);
    expect(claim.next.streakPosition).toBe(4);
    expect(claim.next.streakLevel).toBe(11);
    expect(claim.next.lastClaimDay).toBe("2026-07-21");
  });

  it("spends jokers one-for-one to keep the streak level", () => {
    const assessment = assessDailyStreak(
      { ...BASE, jokerTokens: 3 },
      "2026-07-23",
    );
    expect(assessment.claimable).toBe(true);
    expect(assessment.missedDays).toBe(2);
    expect(assessment.jokersSpent).toBe(2);
    expect(assessment.streakLevelLost).toBe(false);
    expect(assessment.settled.jokerTokens).toBe(1);
    expect(assessment.settled.streakLevel).toBe(10);
  });

  it("resets only the streak level when jokers run out; the position cycles on", () => {
    const assessment = assessDailyStreak(BASE, "2026-07-25");
    expect(assessment.streakLevelLost).toBe(true);
    expect(assessment.settled.streakLevel).toBe(0);
    expect(assessment.settled.jokerTokens).toBe(0);
    // Canary quirk preserved: the 0..6 position never resets.
    expect(assessment.settled.streakPosition).toBe(3);
    const claim = claimDailyStreak(assessment.settled, "2026-07-25");
    expect(claim.rewardDay).toBe(4);
    expect(claim.next.streakLevel).toBe(1);
  });

  it("grants one joker per calendar month up to the cap of three", () => {
    const august = assessDailyStreak(BASE, "2026-08-02");
    // +1 monthly joker, but 12 missed days overwhelm it: the streak level
    // resets and the jokers zero out unspent (Canary's else branch).
    expect(august.streakLevelLost).toBe(true);
    expect(august.jokersSpent).toBe(0);
    expect(august.settled.jokerTokens).toBe(0);
    expect(august.settled.lastJokerMonth).toBe("2026-08");

    const capped = assessDailyStreak(
      { ...BASE, jokerTokens: 3, lastClaimDay: "2026-07-31" },
      "2026-08-01",
    );
    expect(capped.settled.jokerTokens).toBe(3);
    // No grant happened, so the month marker must not advance.
    expect(capped.settled.lastJokerMonth).toBe("2026-07");
  });

  it("treats the first claim ever as claimable with no misses", () => {
    const fresh = assessDailyStreak(
      {
        streakPosition: 0,
        streakLevel: 0,
        jokerTokens: 0,
        lastClaimDay: null,
        lastJokerMonth: null,
      },
      "2026-07-26",
    );
    expect(fresh.claimable).toBe(true);
    expect(fresh.missedDays).toBe(0);
    // The very first assessment also seeds the monthly joker.
    expect(fresh.settled.jokerTokens).toBe(1);
    const claim = claimDailyStreak(fresh.settled, "2026-07-26");
    expect(claim.rewardDay).toBe(1);
  });

  it("cycles day 7 back to day 1", () => {
    const assessment = assessDailyStreak(
      { ...BASE, streakPosition: 6 },
      "2026-07-21",
    );
    const claim = claimDailyStreak(assessment.settled, "2026-07-21");
    expect(claim.rewardDay).toBe(7);
    expect(claim.next.streakPosition).toBe(0);
  });
});
