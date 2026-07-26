import { describe, expect, it } from "vitest";
import type { Monster } from "../creature/Monster";
import { RewardBossTracker } from "./RewardBossTracker";

function fakeBoss(id: string, damage: Record<string, number>): Monster {
  return {
    id,
    damageFrom: (playerId: string) => damage[playerId] ?? 0,
    damagerIds: () => Object.keys(damage),
  } as unknown as Monster;
}

describe("RewardBossTracker", () => {
  it("credits healing only when the healed player is in the fight", () => {
    const tracker = new RewardBossTracker();
    const boss = fakeBoss("boss-1", { tank: 500 });
    tracker.onBossDamageTaken(boss, "tank", 300);
    tracker.onPlayerHealed("healer", "tank", 200, () => boss);
    tracker.onPlayerHealed("healer", "stranger", 999, () => boss);
    const shares = tracker.sharesFor(boss);
    const healer = shares.find((share) => share.characterId === "healer");
    expect(healer).toBeDefined();
    expect(shares.find((s) => s.characterId === "tank")).toBeDefined();
    expect(shares.some((s) => s.characterId === "stranger")).toBe(false);
  });

  it("never credits self-healing", () => {
    const tracker = new RewardBossTracker();
    const boss = fakeBoss("boss-1", { tank: 500 });
    tracker.onBossDamageTaken(boss, "tank", 300);
    tracker.onPlayerHealed("tank", "tank", 400, () => boss);
    const shares = tracker.sharesFor(boss);
    expect(shares).toHaveLength(1);
    expect(shares[0]!.characterId).toBe("tank");
  });

  it("drops tracking for bosses that left the world", () => {
    const tracker = new RewardBossTracker();
    const boss = fakeBoss("boss-1", { tank: 100 });
    tracker.onBossDamageTaken(boss, "tank", 50);
    tracker.onPlayerHealed("healer", "tank", 10, () => undefined);
    // The stale entry was pruned; a later death finds only the damage map.
    const shares = tracker.sharesFor(boss);
    expect(shares.map((share) => share.characterId)).toEqual(["tank"]);
  });

  it("clears state after sharesFor so a respawn starts fresh", () => {
    const tracker = new RewardBossTracker();
    const boss = fakeBoss("boss-1", { tank: 100 });
    tracker.onBossDamageTaken(boss, "tank", 50);
    tracker.sharesFor(boss);
    const again = tracker.sharesFor(fakeBoss("boss-1", {}));
    expect(again).toEqual([]);
  });
});
