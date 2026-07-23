import { describe, expect, it } from "vitest";
import type { FightState } from "@tibia/protocol";
import { anchorFightStateCooldowns } from "./anchorFightStateCooldowns";

describe("anchorFightStateCooldowns", () => {
  it("anchors server remaining time to the client clock without mutating input", () => {
    const fightState: FightState = {
      attackTargetId: null,
      mode: { attack: "offensive", chase: false, secure: true },
      conditions: [],
      cooldowns: [
        {
          group: "spell:exori",
          readyAt: 9_000_000,
          remainingMs: 2_500,
          totalMs: 4_000,
        },
      ],
    };

    const anchored = anchorFightStateCooldowns(fightState, 1_000);

    expect(anchored.cooldowns[0]?.readyAt).toBe(3_500);
    expect(fightState.cooldowns[0]?.readyAt).toBe(9_000_000);
  });
});
